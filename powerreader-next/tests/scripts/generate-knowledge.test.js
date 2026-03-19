/**
 * Unit tests for scripts/generate-knowledge.mjs
 *
 * Tests cover: merge, dedup, missing dir, empty dir, malformed files
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted ensures these are available when vi.mock is hoisted
const {
  mockExistsSync,
  mockReaddirSync,
  mockReadFileSync,
  mockWriteFileSync,
  mockMkdirSync
} = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReaddirSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockMkdirSync: vi.fn()
}));

vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    readdirSync: mockReaddirSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync: mockMkdirSync
  },
  existsSync: mockExistsSync,
  readdirSync: mockReaddirSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync
}));

import { generateKnowledgeJson } from '../../scripts/generate-knowledge.mjs';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateKnowledgeJson', () => {
  it('returns empty when batch dir does not exist', () => {
    mockExistsSync.mockReturnValue(false);

    const result = generateKnowledgeJson();

    expect(result).toEqual({ total: 0, types: {}, parties: {} });
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('returns empty when no batch files found', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['readme.txt', 'other.json']);

    const result = generateKnowledgeJson();

    expect(result).toEqual({ total: 0, types: {}, parties: {} });
  });

  it('merges entries from multiple batch files', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['batch_001.json', 'batch_002.json']);
    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify({
        entries: [
          { id: 'p1', type: 'politician', title: 'Person A', content: 'Bio A', party: 'KMT' }
        ]
      }))
      .mockReturnValueOnce(JSON.stringify({
        entries: [
          { id: 'p2', type: 'politician', title: 'Person B', content: 'Bio B', party: 'DPP' }
        ]
      }));

    const result = generateKnowledgeJson();

    expect(result.total).toBe(2);
    expect(result.types).toEqual({ politician: 2 });
    expect(result.parties).toEqual({ KMT: 1, DPP: 1 });
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
  });

  it('deduplicates entries by id (last wins)', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['batch_001.json', 'batch_002.json']);
    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify({
        entries: [
          { id: 'p1', type: 'politician', title: 'Old Name', content: 'Old bio', party: 'KMT' }
        ]
      }))
      .mockReturnValueOnce(JSON.stringify({
        entries: [
          { id: 'p1', type: 'politician', title: 'New Name', content: 'New bio', party: 'KMT' }
        ]
      }));

    const result = generateKnowledgeJson();

    expect(result.total).toBe(1);
    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1]);
    expect(written.entries[0].title).toBe('New Name');
  });

  it('handles mixed types and counts correctly', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['batch_001.json']);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({
      entries: [
        { id: 'p1', type: 'politician', title: 'A', content: 'c', party: 'KMT' },
        { id: 'e1', type: 'event', title: 'B', content: 'c' },
        { id: 't1', type: 'term', title: 'C', content: 'c' },
        { id: 'm1', type: 'media', title: 'D', content: 'c' }
      ]
    }));

    const result = generateKnowledgeJson();

    expect(result.total).toBe(4);
    expect(result.types).toEqual({ politician: 1, event: 1, term: 1, media: 1 });
    expect(result.parties).toEqual({ KMT: 1 });
  });

  it('skips entries without id', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['batch_001.json']);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({
      entries: [
        { id: 'p1', type: 'politician', title: 'A', content: 'c' },
        { type: 'politician', title: 'No ID', content: 'c' },
        { id: '', type: 'politician', title: 'Empty ID', content: 'c' }
      ]
    }));

    const result = generateKnowledgeJson();

    expect(result.total).toBe(1);
  });

  it('handles malformed JSON file gracefully', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['batch_001.json', 'batch_002.json']);
    mockReadFileSync
      .mockReturnValueOnce('{ invalid json }}}')
      .mockReturnValueOnce(JSON.stringify({
        entries: [{ id: 'p1', type: 'politician', title: 'Good', content: 'c' }]
      }));

    const result = generateKnowledgeJson();

    expect(result.total).toBe(1);
  });

  it('creates output directory', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['batch_001.json']);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({
      entries: [{ id: 'p1', type: 'politician', title: 'A', content: 'c' }]
    }));

    generateKnowledgeJson();

    expect(mockMkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });

  it('writes valid JSON output with metadata', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['batch_001.json']);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({
      entries: [{ id: 'p1', type: 'politician', title: 'A', content: 'c', party: 'DPP' }]
    }));

    generateKnowledgeJson();

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1]);
    expect(written).toHaveProperty('generated_at');
    expect(written).toHaveProperty('total', 1);
    expect(written).toHaveProperty('types');
    expect(written).toHaveProperty('parties');
    expect(written).toHaveProperty('entries');
    expect(written.entries[0]).toEqual({
      id: 'p1',
      type: 'politician',
      title: 'A',
      content: 'c',
      party: 'DPP'
    });
  });

  it('handles file with no entries array gracefully', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['batch_001.json']);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({ data: 'no entries key' }));

    const result = generateKnowledgeJson();

    expect(result.total).toBe(0);
  });
});
