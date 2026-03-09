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
