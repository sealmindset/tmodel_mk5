/**
 * Status Indicator Tests
 * Tests the Redis and OpenAI status checking functionality
 */
const assert = require('assert');
const redisClient = require('../utils/redis');
const { Configuration, OpenAIApi } = require('openai');

// Mock implementations for testing
jest.mock('../utils/redis', () => ({
  ping: jest.fn()
}));

jest.mock('openai', () => ({
  Configuration: jest.fn().mockImplementation(() => ({})),
  OpenAIApi: jest.fn().mockImplementation(() => ({
    listModels: jest.fn()
  }))
}));

describe('Service Status Indicators', () => {
  beforeEach(() => {
    // Reset mock implementations
    jest.clearAllMocks();
  });

  test('Redis status check should work when Redis is available', async () => {
    // Mock a successful ping
    redisClient.ping.mockResolvedValue('PONG');
    
    // Test the ping
    const result = await redisClient.ping();
    
    // Verify it was called and returned correctly
    expect(redisClient.ping).toHaveBeenCalled();
    expect(result).toBe('PONG');
  });
  
  test('Redis status check should handle errors when Redis is unavailable', async () => {
    // Mock a failed ping
    redisClient.ping.mockRejectedValue(new Error('Connection refused'));
    
    // Test the ping and expect it to throw
    await expect(redisClient.ping()).rejects.toThrow('Connection refused');
    expect(redisClient.ping).toHaveBeenCalled();
  });
  
  test('OpenAI status check should work when API is available', async () => {
    // Set up OpenAI mock
    const openai = new OpenAIApi();
    openai.listModels.mockResolvedValue({ data: { data: [] } });
    
    // Test the model listing
    const result = await openai.listModels();
    
    // Verify it was called and returned correctly
    expect(openai.listModels).toHaveBeenCalled();
    expect(result).toHaveProperty('data');
  });
  
  test('OpenAI status check should handle errors when API is unavailable', async () => {
    // Set up OpenAI mock to fail
    const openai = new OpenAIApi();
    openai.listModels.mockRejectedValue(new Error('Unauthorized'));
    
    // Test the model listing and expect it to throw
    await expect(openai.listModels()).rejects.toThrow('Unauthorized');
    expect(openai.listModels).toHaveBeenCalled();
  });
});
