/**
 * PowerReader - GPU VRAM Database
 *
 * Maps GPU device names (from WebGPU adapter.info.device) to known VRAM specs.
 * Entries are checked in order — first match wins. More specific patterns
 * (e.g. "Ti SUPER") must come before less specific ones (e.g. "Ti").
 *
 * @copyright MackinHung
 * @license AGPL-3.0
 */

/**
 * @typedef {{ vramMB: number, type: 'discrete'|'integrated'|'unified' }} GPUEntry
 * @typedef {{ pattern: RegExp } & GPUEntry} GPUTableEntry
 */

/** @type {GPUTableEntry[]} */
const GPU_VRAM_TABLE = [
  // ── NVIDIA RTX 50 series ──────────────────────
  { pattern: /RTX\s*5090/i, vramMB: 32768, type: 'discrete' },
  { pattern: /RTX\s*5080/i, vramMB: 16384, type: 'discrete' },
  { pattern: /RTX\s*5070\s*Ti/i, vramMB: 16384, type: 'discrete' },
  { pattern: /RTX\s*5070/i, vramMB: 12288, type: 'discrete' },
  { pattern: /RTX\s*5060\s*Ti/i, vramMB: 16384, type: 'discrete' },
  { pattern: /RTX\s*5060/i, vramMB: 8192, type: 'discrete' },

  // ── NVIDIA RTX 40 series ──────────────────────
  { pattern: /RTX\s*4090/i, vramMB: 24576, type: 'discrete' },
  { pattern: /RTX\s*4080\s*S/i, vramMB: 16384, type: 'discrete' },
  { pattern: /RTX\s*4080/i, vramMB: 16384, type: 'discrete' },
  { pattern: /RTX\s*4070\s*Ti\s*S/i, vramMB: 16384, type: 'discrete' },
  { pattern: /RTX\s*4070\s*Ti/i, vramMB: 12288, type: 'discrete' },
  { pattern: /RTX\s*4070\s*S/i, vramMB: 12288, type: 'discrete' },
  { pattern: /RTX\s*4070/i, vramMB: 12288, type: 'discrete' },
  { pattern: /RTX\s*4060\s*Ti/i, vramMB: 8192, type: 'discrete' },
  { pattern: /RTX\s*4060/i, vramMB: 8192, type: 'discrete' },

  // ── NVIDIA RTX 30 series ──────────────────────
  { pattern: /RTX\s*3090\s*Ti/i, vramMB: 24576, type: 'discrete' },
  { pattern: /RTX\s*3090/i, vramMB: 24576, type: 'discrete' },
  { pattern: /RTX\s*3080\s*Ti/i, vramMB: 12288, type: 'discrete' },
  { pattern: /RTX\s*3080/i, vramMB: 10240, type: 'discrete' },
  { pattern: /RTX\s*3070\s*Ti/i, vramMB: 8192, type: 'discrete' },
  { pattern: /RTX\s*3070/i, vramMB: 8192, type: 'discrete' },
  { pattern: /RTX\s*3060\s*Ti/i, vramMB: 8192, type: 'discrete' },
  { pattern: /RTX\s*3060/i, vramMB: 12288, type: 'discrete' },
  { pattern: /RTX\s*3050/i, vramMB: 8192, type: 'discrete' },

  // ── NVIDIA RTX 20 series ──────────────────────
  { pattern: /RTX\s*2080\s*Ti/i, vramMB: 11264, type: 'discrete' },
  { pattern: /RTX\s*2080\s*S/i, vramMB: 8192, type: 'discrete' },
  { pattern: /RTX\s*2080/i, vramMB: 8192, type: 'discrete' },
  { pattern: /RTX\s*2070\s*S/i, vramMB: 8192, type: 'discrete' },
  { pattern: /RTX\s*2070/i, vramMB: 8192, type: 'discrete' },
  { pattern: /RTX\s*2060\s*S/i, vramMB: 8192, type: 'discrete' },
  { pattern: /RTX\s*2060/i, vramMB: 6144, type: 'discrete' },

  // ── NVIDIA GTX 16 series ──────────────────────
  { pattern: /GTX\s*1660\s*Ti/i, vramMB: 6144, type: 'discrete' },
  { pattern: /GTX\s*1660\s*S/i, vramMB: 6144, type: 'discrete' },
  { pattern: /GTX\s*1660/i, vramMB: 6144, type: 'discrete' },
  { pattern: /GTX\s*1650\s*S/i, vramMB: 4096, type: 'discrete' },
  { pattern: /GTX\s*1650/i, vramMB: 4096, type: 'discrete' },

  // ── NVIDIA GTX 10 series ──────────────────────
  { pattern: /GTX\s*1080\s*Ti/i, vramMB: 11264, type: 'discrete' },
  { pattern: /GTX\s*1080/i, vramMB: 8192, type: 'discrete' },
  { pattern: /GTX\s*1070\s*Ti/i, vramMB: 8192, type: 'discrete' },
  { pattern: /GTX\s*1070/i, vramMB: 8192, type: 'discrete' },
  { pattern: /GTX\s*1060/i, vramMB: 6144, type: 'discrete' },
  { pattern: /GTX\s*1050\s*Ti/i, vramMB: 4096, type: 'discrete' },
  { pattern: /GTX\s*1050/i, vramMB: 2048, type: 'discrete' },

  // ── AMD Radeon RX 9000 series ─────────────────
  { pattern: /RX\s*9070\s*XT/i, vramMB: 16384, type: 'discrete' },
  { pattern: /RX\s*9070/i, vramMB: 16384, type: 'discrete' },

  // ── AMD Radeon RX 7000 series ─────────────────
  { pattern: /RX\s*7900\s*XTX/i, vramMB: 24576, type: 'discrete' },
  { pattern: /RX\s*7900\s*XT/i, vramMB: 20480, type: 'discrete' },
  { pattern: /RX\s*7900\s*GRE/i, vramMB: 16384, type: 'discrete' },
  { pattern: /RX\s*7800\s*XT/i, vramMB: 16384, type: 'discrete' },
  { pattern: /RX\s*7700\s*XT/i, vramMB: 12288, type: 'discrete' },
  { pattern: /RX\s*7600\s*XT/i, vramMB: 16384, type: 'discrete' },
  { pattern: /RX\s*7600/i, vramMB: 8192, type: 'discrete' },

  // ── AMD Radeon RX 6000 series ─────────────────
  { pattern: /RX\s*6950\s*XT/i, vramMB: 16384, type: 'discrete' },
  { pattern: /RX\s*6900\s*XT/i, vramMB: 16384, type: 'discrete' },
  { pattern: /RX\s*6800\s*XT/i, vramMB: 16384, type: 'discrete' },
  { pattern: /RX\s*6800(?!\s*XT)/i, vramMB: 16384, type: 'discrete' },
  { pattern: /RX\s*6750\s*XT/i, vramMB: 12288, type: 'discrete' },
  { pattern: /RX\s*6700\s*XT/i, vramMB: 12288, type: 'discrete' },
  { pattern: /RX\s*6650\s*XT/i, vramMB: 8192, type: 'discrete' },
  { pattern: /RX\s*6600\s*XT/i, vramMB: 8192, type: 'discrete' },
  { pattern: /RX\s*6600(?!\s*XT)/i, vramMB: 8192, type: 'discrete' },
  { pattern: /RX\s*6500\s*XT/i, vramMB: 4096, type: 'discrete' },

  // ── Intel Arc B series ────────────────────────
  // Device names may include (TM): "Arc(TM) B580"
  { pattern: /Arc.*B580/i, vramMB: 12288, type: 'discrete' },
  { pattern: /Arc.*B570/i, vramMB: 10240, type: 'discrete' },

  // ── Intel Arc A series ────────────────────────
  { pattern: /Arc.*A770/i, vramMB: 16384, type: 'discrete' },
  { pattern: /Arc.*A750/i, vramMB: 8192, type: 'discrete' },
  { pattern: /Arc.*A580/i, vramMB: 8192, type: 'discrete' },
  { pattern: /Arc.*A380/i, vramMB: 6144, type: 'discrete' },

  // ── Apple M series (unified memory — size depends on config) ──
  { pattern: /Apple\s*M/i, vramMB: 0, type: 'unified' },

  // ── Intel Integrated GPUs (shared system memory) ──
  { pattern: /Intel.*Iris.*Xe/i, vramMB: 0, type: 'integrated' },
  { pattern: /Intel.*Iris\s*Plus/i, vramMB: 0, type: 'integrated' },
  { pattern: /Intel.*Iris\s*Pro/i, vramMB: 0, type: 'integrated' },
  { pattern: /Intel.*UHD/i, vramMB: 0, type: 'integrated' },
  { pattern: /Intel.*HD\s*Graphics/i, vramMB: 0, type: 'integrated' },

  // ── AMD Integrated (APU) ──────────────────────
  { pattern: /Radeon.*Graphics$/i, vramMB: 0, type: 'integrated' },
  { pattern: /Radeon\s*Vega/i, vramMB: 0, type: 'integrated' },
];

/**
 * Look up GPU VRAM from the known device database.
 *
 * @param {string} deviceName - GPU device name from adapter.info.device
 * @returns {{ vramMB: number, type: 'discrete'|'integrated'|'unified'|'unknown' }}
 */
export function lookupGPU(deviceName) {
  if (!deviceName) return { vramMB: 0, type: 'unknown' };

  for (const entry of GPU_VRAM_TABLE) {
    if (entry.pattern.test(deviceName)) {
      return { vramMB: entry.vramMB, type: entry.type };
    }
  }

  return { vramMB: 0, type: 'unknown' };
}

// ══════════════════════════════════════════════════
// Architecture-level fallback
// ══════════════════════════════════════════════════
//
// Chrome's privacy tiering often hides the device name (returns '').
// When that happens, we can still identify the GPU generation from
// adapter.info.vendor + adapter.info.architecture and provide a
// VRAM range for that generation.

/**
 * @typedef {Object} ArchInfo
 * @property {string} label - Human-readable architecture name
 * @property {string} vramRange - VRAM range string (e.g. "6 ~ 11 GB")
 * @property {string} series - GPU series description
 */

/** @type {Array<{ vendor: RegExp, arch: RegExp } & ArchInfo>} */
const ARCH_VRAM_TABLE = [
  // NVIDIA
  { vendor: /nvidia/i, arch: /blackwell/i, label: 'NVIDIA Blackwell', vramRange: '8 ~ 32 GB', series: 'RTX 50' },
  { vendor: /nvidia/i, arch: /ada/i, label: 'NVIDIA Ada Lovelace', vramRange: '8 ~ 24 GB', series: 'RTX 40' },
  { vendor: /nvidia/i, arch: /ampere/i, label: 'NVIDIA Ampere', vramRange: '8 ~ 24 GB', series: 'RTX 30' },
  { vendor: /nvidia/i, arch: /turing/i, label: 'NVIDIA Turing', vramRange: '4 ~ 11 GB', series: 'RTX 20 / GTX 16' },
  { vendor: /nvidia/i, arch: /pascal/i, label: 'NVIDIA Pascal', vramRange: '2 ~ 11 GB', series: 'GTX 10' },
  // AMD
  { vendor: /amd/i, arch: /rdna\s*4/i, label: 'AMD RDNA 4', vramRange: '16 GB', series: 'RX 9000' },
  { vendor: /amd/i, arch: /rdna\s*3/i, label: 'AMD RDNA 3', vramRange: '8 ~ 24 GB', series: 'RX 7000' },
  { vendor: /amd/i, arch: /rdna\s*2/i, label: 'AMD RDNA 2', vramRange: '4 ~ 16 GB', series: 'RX 6000' },
  // Intel
  { vendor: /intel/i, arch: /xe2/i, label: 'Intel Xe2', vramRange: '10 ~ 12 GB', series: 'Arc B' },
  { vendor: /intel/i, arch: /xe/i, label: 'Intel Xe', vramRange: '6 ~ 16 GB', series: 'Arc A' },
];

/**
 * Look up GPU info by vendor + architecture when device name is unavailable.
 *
 * @param {string} vendor - adapter.info.vendor
 * @param {string} architecture - adapter.info.architecture
 * @returns {ArchInfo|null} Architecture info, or null if no match
 */
export function lookupByArch(vendor, architecture) {
  if (!vendor && !architecture) return null;

  for (const entry of ARCH_VRAM_TABLE) {
    if (entry.vendor.test(vendor || '') && entry.arch.test(architecture || '')) {
      return { label: entry.label, vramRange: entry.vramRange, series: entry.series };
    }
  }

  return null;
}

// ══════════════════════════════════════════════════
// GPU picker — options grouped by architecture
// ══════════════════════════════════════════════════

/** @type {Object<string, Array<{ name: string, vramMB: number }>>} */
const ARCH_GPU_OPTIONS = {
  blackwell: [
    { name: 'RTX 5090', vramMB: 32768 },
    { name: 'RTX 5080', vramMB: 16384 },
    { name: 'RTX 5070 Ti', vramMB: 16384 },
    { name: 'RTX 5070', vramMB: 12288 },
    { name: 'RTX 5060 Ti', vramMB: 16384 },
    { name: 'RTX 5060', vramMB: 8192 },
  ],
  ada: [
    { name: 'RTX 4090', vramMB: 24576 },
    { name: 'RTX 4080 SUPER', vramMB: 16384 },
    { name: 'RTX 4080', vramMB: 16384 },
    { name: 'RTX 4070 Ti SUPER', vramMB: 16384 },
    { name: 'RTX 4070 Ti', vramMB: 12288 },
    { name: 'RTX 4070 SUPER', vramMB: 12288 },
    { name: 'RTX 4070', vramMB: 12288 },
    { name: 'RTX 4060 Ti', vramMB: 8192 },
    { name: 'RTX 4060', vramMB: 8192 },
  ],
  ampere: [
    { name: 'RTX 3090 Ti', vramMB: 24576 },
    { name: 'RTX 3090', vramMB: 24576 },
    { name: 'RTX 3080 Ti', vramMB: 12288 },
    { name: 'RTX 3080', vramMB: 10240 },
    { name: 'RTX 3070 Ti', vramMB: 8192 },
    { name: 'RTX 3070', vramMB: 8192 },
    { name: 'RTX 3060 Ti', vramMB: 8192 },
    { name: 'RTX 3060', vramMB: 12288 },
    { name: 'RTX 3050', vramMB: 8192 },
  ],
  turing: [
    { name: 'RTX 2080 Ti', vramMB: 11264 },
    { name: 'RTX 2080 SUPER', vramMB: 8192 },
    { name: 'RTX 2080', vramMB: 8192 },
    { name: 'RTX 2070 SUPER', vramMB: 8192 },
    { name: 'RTX 2070', vramMB: 8192 },
    { name: 'RTX 2060 SUPER', vramMB: 8192 },
    { name: 'RTX 2060', vramMB: 6144 },
    { name: 'GTX 1660 Ti', vramMB: 6144 },
    { name: 'GTX 1660 SUPER', vramMB: 6144 },
    { name: 'GTX 1660', vramMB: 6144 },
    { name: 'GTX 1650 SUPER', vramMB: 4096 },
    { name: 'GTX 1650', vramMB: 4096 },
  ],
  pascal: [
    { name: 'GTX 1080 Ti', vramMB: 11264 },
    { name: 'GTX 1080', vramMB: 8192 },
    { name: 'GTX 1070 Ti', vramMB: 8192 },
    { name: 'GTX 1070', vramMB: 8192 },
    { name: 'GTX 1060', vramMB: 6144 },
    { name: 'GTX 1050 Ti', vramMB: 4096 },
    { name: 'GTX 1050', vramMB: 2048 },
  ],
  rdna4: [
    { name: 'RX 9070 XT', vramMB: 16384 },
    { name: 'RX 9070', vramMB: 16384 },
  ],
  rdna3: [
    { name: 'RX 7900 XTX', vramMB: 24576 },
    { name: 'RX 7900 XT', vramMB: 20480 },
    { name: 'RX 7900 GRE', vramMB: 16384 },
    { name: 'RX 7800 XT', vramMB: 16384 },
    { name: 'RX 7700 XT', vramMB: 12288 },
    { name: 'RX 7600 XT', vramMB: 16384 },
    { name: 'RX 7600', vramMB: 8192 },
  ],
  rdna2: [
    { name: 'RX 6950 XT', vramMB: 16384 },
    { name: 'RX 6900 XT', vramMB: 16384 },
    { name: 'RX 6800 XT', vramMB: 16384 },
    { name: 'RX 6800', vramMB: 16384 },
    { name: 'RX 6750 XT', vramMB: 12288 },
    { name: 'RX 6700 XT', vramMB: 12288 },
    { name: 'RX 6600 XT', vramMB: 8192 },
    { name: 'RX 6600', vramMB: 8192 },
    { name: 'RX 6500 XT', vramMB: 4096 },
  ],
  xe2: [
    { name: 'Arc B580', vramMB: 12288 },
    { name: 'Arc B570', vramMB: 10240 },
  ],
  xe: [
    { name: 'Arc A770', vramMB: 16384 },
    { name: 'Arc A750', vramMB: 8192 },
    { name: 'Arc A580', vramMB: 8192 },
    { name: 'Arc A380', vramMB: 6144 },
  ],
};

/**
 * Get the list of GPU options for a given architecture (for user picker).
 *
 * @param {string} architecture - adapter.info.architecture (e.g. 'turing')
 * @returns {Array<{ name: string, vramMB: number }>|null}
 */
export function getGPUOptionsForArch(architecture) {
  if (!architecture) return null;
  const key = architecture.toLowerCase().replace(/\s+/g, '');
  return ARCH_GPU_OPTIONS[key] || null;
}
