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
    expect(written.entries[0]).toMatchObject({
      id: 'p1',
      type: 'politician',
      title: 'A',
      content: 'c',
      party: 'DPP',
      _batch: 'batch_001'
    });
  });

  it('handles file with no entries array gracefully', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['batch_001.json']);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({ data: 'no entries key' }));

    const result = generateKnowledgeJson();

    expect(result.total).toBe(0);
  });

  it('passes through stances for topic entries', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['batch_001.json']);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({
      entries: [{
        id: 'top_abc123',
        type: 'topic',
        title: 'Issue X',
        stances: { DPP: 'stance-a', KMT: 'stance-b', TPP: 'stance-c' }
      }]
    }));

    const result = generateKnowledgeJson();

    expect(result.total).toBe(1);
    expect(result.types).toEqual({ topic: 1 });
    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1]);
    expect(written.entries[0].stances).toEqual({ DPP: 'stance-a', KMT: 'stance-b', TPP: 'stance-c' });
    expect(written.entries[0]).not.toHaveProperty('content');
    expect(written.entries[0]).not.toHaveProperty('party');
  });

  it('adds _batch field tracking source file', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['batch_007.json']);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({
      entries: [{ id: 'p1', type: 'politician', title: 'A', content: 'c', party: 'DPP' }]
    }));

    generateKnowledgeJson();

    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1]);
    expect(written.entries[0]._batch).toBe('batch_007');
  });

  it('does not count topic entries in party statistics', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['batch_001.json']);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({
      entries: [
        { id: 'p1', type: 'politician', title: 'A', content: 'c', party: 'KMT' },
        { id: 'top_1', type: 'topic', title: 'Issue', stances: { DPP: 's1', KMT: 's2', TPP: 's3' } }
      ]
    }));

    const result = generateKnowledgeJson();

    expect(result.total).toBe(2);
    expect(result.types).toEqual({ politician: 1, topic: 1 });
    // Only the politician should be counted in parties
    expect(result.parties).toEqual({ KMT: 1 });
  });

  it('output has no type:term after migration', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['batch_001.json']);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({
      entries: [
        { id: 'p1', type: 'politician', title: 'A', content: 'c', party: 'DPP' },
        { id: 'e1', type: 'event', title: 'B', content: 'c' },
        { id: 'top_1', type: 'topic', title: 'C', stances: { DPP: 's', KMT: 's', TPP: 's' } }
      ]
    }));

    const result = generateKnowledgeJson();

    expect(result.types).not.toHaveProperty('term');
    expect(result.types).toEqual({ politician: 1, event: 1, topic: 1 });
  });
});
