import dotenv from 'dotenv';
import { jest } from '@jest/globals';

dotenv.config({ path: '.env.test' });

Object.assign(process.env, {
  NODE_ENV: 'test',
  DISCORD_TOKEN: 'test_token',
  DISCORD_CLIENT_ID: '123456789012345678',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/pegasus_test',
  BOT_API_TOKEN: 'test_api_token_1234567890',
  API_TOKEN: 'test_api_token_secondary',
  DEVELOPER_IDS: '["123456789012345678"]',
  ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
  SUPPORT_SERVER_INVITE: 'https://example.com/invite',
  DEFAULT_LANGUAGE: 'en',
  LOG_LEVEL: 'error'
});

global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.setTimeout(10000);

beforeAll(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.clearAllMocks();
});

afterAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 100));
});
