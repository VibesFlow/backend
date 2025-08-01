/**
 * PERSISTENCE.JS - DynamoDB Persistence Layer for Vibestreams
 * Provides persistent storage for vibestreams data across Lambda invocations
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

class PersistenceService {
  constructor() {
    this.client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
    this.docClient = DynamoDBDocumentClient.from(this.client);
    this.tableName = process.env.VIBESTREAMS_TABLE || 'vibesflow-vibestreams-dev';
  }

  /**
   * Save or update RTA metadata
   */
  async saveRTAMetadata(rtaData) {
    try {
      const item = {
        rta_id: rtaData.rta_id,
        upload_timestamp: rtaData.upload_timestamp || Date.now(),
        creator: rtaData.creator,
        is_complete: rtaData.is_complete || false,
        chunks: rtaData.chunks || [],
        total_duration: rtaData.total_duration || 0,
        proof_set_id: rtaData.proof_set_id,
        storage_provider: rtaData.storage_provider,
        compiled_metadata: rtaData.compiled_metadata,
        last_updated: Date.now(),
        chunks_detail: rtaData.chunks_detail || [],
        total_size_mb: rtaData.total_size_mb || 0
      };

      const command = new PutCommand({
        TableName: this.tableName,
        Item: item
      });

      await this.docClient.send(command);
      console.log(`✅ RTA metadata saved to DynamoDB: ${rtaData.rta_id}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to save RTA metadata:', error);
      throw error;
    }
  }

  /**
   * Get RTA metadata by ID
   */
  async getRTAMetadata(rtaId) {
    try {
      const command = new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'rta_id = :rtaId',
        ExpressionAttributeValues: {
          ':rtaId': rtaId
        },
        ScanIndexForward: false, // Latest first
        Limit: 1
      });

      const result = await this.docClient.send(command);
      
      if (result.Items && result.Items.length > 0) {
        console.log(`✅ RTA metadata retrieved: ${rtaId}`);
        return result.Items[0];
      }
      
      console.log(`⚠️ RTA metadata not found: ${rtaId}`);
      return null;
    } catch (error) {
      console.error('❌ Failed to get RTA metadata:', error);
      throw error;
    }
  }

  /**
   * Add chunk to existing RTA
   */
  async addChunkToRTA(rtaId, chunkData) {
    try {
      // First get the existing RTA metadata
      const existingRTA = await this.getRTAMetadata(rtaId);
      
      if (!existingRTA) {
        // Create new RTA if it doesn't exist
        const newRTA = {
          rta_id: rtaId,
          upload_timestamp: Date.now(),
          creator: chunkData.creator || 'unknown',
          is_complete: false,
          chunks: [chunkData],
          total_duration: chunkData.duration || 60,
          chunks_detail: [chunkData],
          total_size_mb: (chunkData.size || 0) / (1024 * 1024)
        };
        
        return await this.saveRTAMetadata(newRTA);
      }

      // Update existing RTA
      const updatedChunks = [...(existingRTA.chunks || []), chunkData];
      const updatedChunksDetail = [...(existingRTA.chunks_detail || []), chunkData];
      const totalDuration = updatedChunks.reduce((sum, chunk) => sum + (chunk.duration || 60), 0);
      const totalSizeMB = updatedChunks.reduce((sum, chunk) => sum + (chunk.size || 0), 0) / (1024 * 1024);

      const command = new UpdateCommand({
        TableName: this.tableName,
        Key: {
          rta_id: rtaId,
          upload_timestamp: existingRTA.upload_timestamp
        },
        UpdateExpression: 'SET chunks = :chunks, chunks_detail = :chunksDetail, total_duration = :totalDuration, total_size_mb = :totalSizeMB, last_updated = :lastUpdated',
        ExpressionAttributeValues: {
          ':chunks': updatedChunks,
          ':chunksDetail': updatedChunksDetail,
          ':totalDuration': totalDuration,
          ':totalSizeMB': totalSizeMB,
          ':lastUpdated': Date.now()
        }
      });

      await this.docClient.send(command);
      console.log(`✅ Chunk added to RTA: ${rtaId}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to add chunk to RTA:', error);
      throw error;
    }
  }

  /**
   * Mark RTA as complete
   */
  async completeRTA(rtaId, finalMetadata = null) {
    try {
      const existingRTA = await this.getRTAMetadata(rtaId);
      
      if (!existingRTA) {
        console.warn(`⚠️ Cannot complete non-existent RTA: ${rtaId}`);
        return false;
      }

      let updateExpression = 'SET is_complete = :isComplete, completed_at = :completedAt, last_updated = :lastUpdated';
      const expressionAttributeValues = {
        ':isComplete': true,
        ':completedAt': Date.now(),
        ':lastUpdated': Date.now()
      };

      if (finalMetadata) {
        updateExpression += ', compiled_metadata = :compiledMetadata';
        expressionAttributeValues[':compiledMetadata'] = finalMetadata;
      }

      const command = new UpdateCommand({
        TableName: this.tableName,
        Key: {
          rta_id: rtaId,
          upload_timestamp: existingRTA.upload_timestamp
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues
      });

      await this.docClient.send(command);
      console.log(`✅ RTA marked as complete: ${rtaId}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to complete RTA:', error);
      throw error;
    }
  }

  /**
   * Get all vibestreams for FilCDN (complete RTAs only)
   */
  async getAllVibestreams() {
    try {
      const command = new ScanCommand({
        TableName: this.tableName,
        FilterExpression: 'is_complete = :isComplete',
        ExpressionAttributeValues: {
          ':isComplete': true
        }
      });

      const result = await this.docClient.send(command);
      
      if (result.Items && result.Items.length > 0) {
        // Sort by upload timestamp (newest first)
        const sortedItems = result.Items.sort((a, b) => b.upload_timestamp - a.upload_timestamp);
        
        // Transform to FilCDN-compatible format
        const vibestreams = sortedItems.map(item => this.transformToFilCDNFormat(item));
        
        console.log(`✅ Retrieved ${vibestreams.length} vibestreams from DynamoDB`);
        return vibestreams;
      }
      
      console.log('ℹ️ No complete vibestreams found in DynamoDB');
      return [];
    } catch (error) {
      console.error('❌ Failed to get vibestreams:', error);
      throw error;
    }
  }

  /**
   * Get vibestreams by creator
   */
  async getVibestreamsByCreator(creator) {
    try {
      const command = new QueryCommand({
        TableName: this.tableName,
        IndexName: 'creator-timestamp-index',
        KeyConditionExpression: 'creator = :creator',
        FilterExpression: 'is_complete = :isComplete',
        ExpressionAttributeValues: {
          ':creator': creator,
          ':isComplete': true
        },
        ScanIndexForward: false // Latest first
      });

      const result = await this.docClient.send(command);
      
      if (result.Items && result.Items.length > 0) {
        const vibestreams = result.Items.map(item => this.transformToFilCDNFormat(item));
        console.log(`✅ Retrieved ${vibestreams.length} vibestreams for creator: ${creator}`);
        return vibestreams;
      }
      
      return [];
    } catch (error) {
      console.error('❌ Failed to get vibestreams by creator:', error);
      throw error;
    }
  }

  /**
   * Transform DynamoDB item to FilCDN-compatible format
   */
  transformToFilCDNFormat(item) {
    const filecoinAddress = process.env.FILECOIN_ADDRESS || '0xedD801D6c993B3c8052e485825A725ee09F1ff4D';
    
    // Sort chunks by sequence for proper ordering
    const sortedChunks = (item.chunks_detail || []).sort((a, b) => {
      const seqA = parseInt(a.chunk_id?.split('_chunk_')[1]?.split('_')[0]) || 0;
      const seqB = parseInt(b.chunk_id?.split('_chunk_')[1]?.split('_')[0]) || 0;
      return seqA - seqB;
    });

    // Calculate accurate RTA duration with proper final chunk handling
    let TotalDuration = 0;
    
    if (sortedChunks.length > 0) {
      // Standard chunks are 60 seconds, final chunk may be shorter
      const fullChunks = sortedChunks.length - 1;
      TotalDuration = fullChunks * 60; // All non-final chunks are 60s
      
      // Calculate final chunk duration more accurately
      const finalChunk = sortedChunks[sortedChunks.length - 1];
      let finalChunkDuration = 60;
      
      if (finalChunk.chunk_id && finalChunk.chunk_id.includes('_final')) {
        // For final chunks, estimate duration from size (rough approximation)
        // Average chunk is ~800KB for 60s, so we can estimate
        const avgBytesPerSecond = 800000 / 60; // ~13.3KB per second
        finalChunkDuration = Math.min(60, Math.max(1, Math.round(finalChunk.size / avgBytesPerSecond)));
      }
      
      TotalDuration += finalChunkDuration;
      
      // Update the final chunk's duration for accurate playback
      if (sortedChunks.length > 0) {
        sortedChunks[sortedChunks.length - 1].duration = finalChunkDuration;
      }
    }

    return {
      rta_id: item.rta_id,
      creator: item.creator,
      rta_duration: this.formatDuration(TotalDuration),
      chunks: sortedChunks.length,
      is_complete: item.is_complete,
      
      // FilCDN integration
      filcdn_base: `https://${filecoinAddress}.calibration.filcdn.io/`,
      filcdn_wallet: filecoinAddress,
      network: 'calibration',
      
      // Synapse details
      synapse_proof_set_id: item.proof_set_id || 0,
      storage_provider: item.storage_provider,
      
      // URLs for first and last chunks
      first_chunk_url: sortedChunks.length > 0 ? 
        `https://${filecoinAddress}.calibration.filcdn.io/${sortedChunks[0].cid}` : null,
      last_chunk_url: sortedChunks.length > 0 ? 
        `https://${filecoinAddress}.calibration.filcdn.io/${sortedChunks[sortedChunks.length - 1].cid}` : null,
      
      // Metadata
      upload_timestamp: item.upload_timestamp,
      total_size_mb: item.total_size_mb || 0,
      
      // Detailed chunk information for playback with accurate durations
      chunks_detail: sortedChunks.map((chunk, index) => ({
        chunk_id: chunk.chunk_id,
        cid: chunk.cid,
        size: chunk.size,
        root_id: chunk.root_id,
        url: `https://${filecoinAddress}.calibration.filcdn.io/${chunk.cid}`,
        duration: chunk.duration, // Now accurately calculated above
        participants: chunk.participants || 1,
        owner: `${item.creator}.testnet`,
        sequence: parseInt(chunk.chunk_id?.split('_chunk_')[1]?.split('_')[0]) || 0,
        is_final: chunk.chunk_id && chunk.chunk_id.includes('_final')
      }))
    };
  }

  /**
   * Format duration in MM:SS format
   */
  formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  /**
   * Clean up old incomplete RTAs (older than 24 hours)
   */
  async cleanupIncompleteRTAs() {
    try {
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      
      const command = new ScanCommand({
        TableName: this.tableName,
        FilterExpression: 'is_complete = :isComplete AND upload_timestamp < :cutoff',
        ExpressionAttributeValues: {
          ':isComplete': false,
          ':cutoff': oneDayAgo
        }
      });

      const result = await this.docClient.send(command);
      
      if (result.Items && result.Items.length > 0) {
        console.log(`🗑️ Found ${result.Items.length} incomplete RTAs to clean up`);
        // Implementation for deletion would go here if needed
        return result.Items.length;
      }
      
      return 0;
    } catch (error) {
      console.error('❌ Failed to cleanup incomplete RTAs:', error);
      throw error;
    }
  }
}

// Export singleton instance
const persistenceService = new PersistenceService();
module.exports = persistenceService; 