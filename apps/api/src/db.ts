import pg from 'pg';

const { Pool } = pg;

const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL is required');

// Force TCP — prevents pg from falling back to a Unix socket on macOS
export const db = new Pool({ connectionString: url, ssl: false });
