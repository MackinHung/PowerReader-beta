/**
 * Unit tests for scripts/migrate-terms-to-topics.mjs
 *
 * Tests cover: term→topic merging, prefix stripping, ID generation,
 * missing party warnings, non-term preservation, empty file handling
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockExistsSync,
  mockReaddirSync,
  mockReadFileSync,
  mockWriteFileSync,
  mockMkdirSync,
  mockCopyFileSync
} = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReaddirSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockCopyFileSync: vi.fn()
}));

vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    readdirSync: mockReaddirSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync: mockMkdirSync,
    copyFileSync: mockCopyFileSync
  },
  existsSync: mockExistsSync,
  readdirSync: mockReaddirSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
  copyFileSync: mockCopyFileSync
}));

import { migrateTermsToTopics, generateTopicId, stripPrefix } from '../../scripts/migrate-terms-to-topics.mjs';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateTopicId', () => {
  it('produces deterministic IDs for same title', () => {
    const id1 = generateTopicId('長照2.0');
    const id2 = generateTopicId('長照2.0');
    expect(id1).toBe(id2);
  });

  it('starts with top_ prefix', () => {
    const id = generateTopicId('九二共識');
    expect(id).toMatch(/^top_[a-f0-9]{12}$/);
  });

  it('produces different IDs for different titles', () => {
    const id1 = generateTopicId('長照2.0');
    const id2 = generateTopicId('九二共識');
    expect(id1).not.toBe(id2);
  });
});

describe('stripPrefix', () => {
  it('strips half-width colon prefix', () => {
    const result = stripPrefix('[民進黨] 長照2.0: 長照2.0(社區化)、維持健保');
    expect(result).toBe('長照2.0(社區化)、維持健保');
  });

  it('strips full-width colon prefix', () => {
    const result = stripPrefix('[國民黨] 長照2.0：推動長照保險制度');
    expect(result).toBe('推動長照保險制度');
  });

  it('returns original content when no prefix matches', () => {
    const result = stripPrefix('no prefix here');
    expect(result).toBe('no prefix here');
  });

  it('handles content with extra spaces after colon', () => {
    const result = stripPrefix('[民眾黨] 教育:  雙語政策');
    expect(result).toBe('雙語政策');
  });
});

describe('migrateTermsToTopics', () => {
  it('returns empty when batch dir does not exist', () => {
    mockExistsSync.mockReturnValue(false);

    const result = migrateTermsToTopics({ skipBackup: true });

    expect(result).toEqual({ termsRemoved: 0, topicsCreated: 0, warnings: [] });
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('returns empty when no batch files found', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['readme.txt']);

    const result = migrateTermsToTopics({ skipBackup: true });

    expect(result).toEqual({ termsRemoved: 0, topicsCreated: 0, warnings: [] });
  });

  it('merges 3 term entries with same title into 1 topic', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['batch_001.json']);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({
      entries: [
        { id: 'trm_a', type: 'term', title: '長照2.0', content: '[民進黨] 長照2.0: 社區化', party: 'DPP' },
        { id: 'trm_b', type: 'term', title: '長照2.0', content: '[國民黨] 長照2.0: 保險制', party: 'KMT' },
        { id: 'trm_c', type: 'term', title: '長照2.0', content: '[民眾黨] 長照2.0: 提升GDP', party: 'TPP' }
      ]
    }));

    const result = migrateTermsToTopics({ skipBackup: true });

    expect(result.termsRemoved).toBe(3);
    expect(result.topicsCreated).toBe(1);
    expect(result.warnings).toHaveLength(0);

    // Verify written output
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1]);
    expect(written.entries).toHaveLength(1);
    const topic = written.entries[0];
    expect(topic.type).toBe('topic');
    expect(topic.title).toBe('長照2.0');
    expect(topic.id).toBe(generateTopicId('長照2.0'));
    expect(topic.stances.DPP).toBe('社區化');
    expect(topic.stances.KMT).toBe('保險制');
    expect(topic.stances.TPP).toBe('提升GDP');
  });

  it('strips content prefix correctly (half-width colon)', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['batch_001.json']);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({
      entries: [
        { id: 'trm_a', type: 'term', title: 'X', content: '[民進黨] X: stance-DPP', party: 'DPP' },
        { id: 'trm_b', type: 'term', title: 'X', content: '[國民黨] X: stance-KMT', party: 'KMT' },
        { id: 'trm_c', type: 'term', title: 'X', content: '[民眾黨] X: stance-TPP', party: 'TPP' }
      ]
    }));

    migrateTermsToTopics({ skipBackup: true });

    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1]);
    expect(written.entries[0].stances.DPP).toBe('stance-DPP');
    expect(written.entries[0].stances.KMT).toBe('stance-KMT');
    expect(written.entries[0].stances.TPP).toBe('stance-TPP');
  });

  it('warns when topic has fewer than 3 party stances', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['batch_001.json']);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({
      entries: [
        { id: 'trm_a', type: 'term', title: 'Y', content: '[民進黨] Y: stance', party: 'DPP' },
        { id: 'trm_b', type: 'term', title: 'Y', content: '[國民黨] Y: stance', party: 'KMT' }
      ]
    }));

    const result = migrateTermsToTopics({ skipBackup: true });

    expect(result.topicsCreated).toBe(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('TPP');
  });

  it('preserves politician and event entries unchanged', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['batch_001.json']);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({
      entries: [
        { id: 'pol_1', type: 'politician', title: 'Person', content: 'Bio', party: 'DPP' },
        { id: 'evt_1', type: 'event', title: 'Event', content: 'Details' },
        { id: 'trm_a', type: 'term', title: 'Z', content: '[民進黨] Z: s', party: 'DPP' },
        { id: 'trm_b', type: 'term', title: 'Z', content: '[國民黨] Z: s', party: 'KMT' },
        { id: 'trm_c', type: 'term', title: 'Z', content: '[民眾黨] Z: s', party: 'TPP' }
      ]
    }));

    const result = migrateTermsToTopics({ skipBackup: true });

    expect(result.termsRemoved).toBe(3);
    expect(result.topicsCreated).toBe(1);

    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1]);
    expect(written.entries).toHaveLength(3); // 1 politician + 1 event + 1 topic
    expect(written.entries.find(e => e.id === 'pol_1')).toBeTruthy();
    expect(written.entries.find(e => e.id === 'evt_1')).toBeTruthy();
    expect(written.entries.find(e => e.type === 'topic')).toBeTruthy();
  });

  it('handles empty entries array', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['batch_001.json']);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({ entries: [] }));

    const result = migrateTermsToTopics({ skipBackup: true });

    expect(result.termsRemoved).toBe(0);
    expect(result.topicsCreated).toBe(0);
  });

  it('generates deterministic IDs (same title = same ID)', () => {
    const id1 = generateTopicId('長照2.0');
    const id2 = generateTopicId('長照2.0');
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^top_[a-f0-9]{12}$/);
  });

  it('creates backup files when skipBackup is false', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['batch_001.json']);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({ entries: [] }));

    migrateTermsToTopics({ skipBackup: false });

    expect(mockMkdirSync).toHaveBeenCalled();
    expect(mockCopyFileSync).toHaveBeenCalledTimes(1);
  });

  it('handles terms spread across multiple batch files', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['batch_001.json', 'batch_002.json']);
    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify({
        entries: [
          { id: 'trm_a', type: 'term', title: 'T1', content: '[民進黨] T1: s1', party: 'DPP' }
        ]
      }))
      .mockReturnValueOnce(JSON.stringify({
        entries: [
          { id: 'trm_b', type: 'term', title: 'T1', content: '[國民黨] T1: s2', party: 'KMT' },
          { id: 'trm_c', type: 'term', title: 'T1', content: '[民眾黨] T1: s3', party: 'TPP' }
        ]
      }));

    const result = migrateTermsToTopics({ skipBackup: true });

    expect(result.topicsCreated).toBe(1);
    expect(result.termsRemoved).toBe(3);

    // Topic should be placed in first file that had terms with that title
    const written1 = JSON.parse(mockWriteFileSync.mock.calls[0][1]);
    expect(written1.entries).toHaveLength(1);
    expect(written1.entries[0].type).toBe('topic');
    expect(written1.entries[0].stances).toHaveProperty('DPP');
    expect(written1.entries[0].stances).toHaveProperty('KMT');
    expect(written1.entries[0].stances).toHaveProperty('TPP');

    // Second file should be empty
    const written2 = JSON.parse(mockWriteFileSync.mock.calls[1][1]);
    expect(written2.entries).toHaveLength(0);
  });

  it('handles malformed JSON file gracefully', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['batch_001.json', 'batch_002.json']);
    mockReadFileSync
      .mockReturnValueOnce('{ broken json')
      .mockReturnValueOnce(JSON.stringify({
        entries: [
          { id: 'trm_a', type: 'term', title: 'T', content: '[民進黨] T: s', party: 'DPP' },
          { id: 'trm_b', type: 'term', title: 'T', content: '[國民黨] T: s', party: 'KMT' },
          { id: 'trm_c', type: 'term', title: 'T', content: '[民眾黨] T: s', party: 'TPP' }
        ]
      }));

    const result = migrateTermsToTopics({ skipBackup: true });

    expect(result.topicsCreated).toBe(1);
    expect(result.termsRemoved).toBe(3);
  });
});
