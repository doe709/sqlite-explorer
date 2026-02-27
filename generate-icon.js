// Round PNG icon generator 128x128 with no dependencies
const fs = require('fs');
const zlib = require('zlib');

const width = 128;
const height = 128;
const cx = 64, cy = 64; // center
const R = 60;            // circle radius

// Create RGBA data
const rawData = [];
for (let y = 0; y < height; y++) {
    rawData.push(0); // filter byte (None)
    for (let x = 0; x < width; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Outside the circle — transparent pixel
        if (dist > R + 1) {
            rawData.push(0, 0, 0, 0);
            continue;
        }

        // Anti-aliasing at circle edge
        let alpha = 255;
        if (dist > R - 1) {
            alpha = Math.round(255 * Math.max(0, R + 1 - dist) / 2);
        }

        // Background — gradient from #1a6fb5 (top) to #0d4a7a (bottom)
        const ratio = y / height;
        let r = Math.round(26 - ratio * 13);
        let g = Math.round(111 - ratio * 40);
        let b = Math.round(181 - ratio * 60);

        // === DB icon (cylinder) ===
        const dbCx = 64;     // cylinder center X
        const dbTop = 32;    // cylinder top
        const dbBot = 96;    // cylinder bottom
        const dbW = 26;      // cylinder half-width
        const ellH = 8;      // ellipse height

        const relX = (x - dbCx) / dbW;
        let isDb = false;

        // Top ellipse
        const topEy = (y - dbTop) / ellH;
        if (Math.abs(relX) <= 1 && topEy * topEy + relX * relX <= 1) {
            isDb = true;
        }

        // Bottom ellipse
        const botEy = (y - dbBot) / ellH;
        if (Math.abs(relX) <= 1 && botEy * botEy + relX * relX <= 1) {
            isDb = true;
        }

        // Middle ellipse
        const midY = (dbTop + dbBot) / 2;
        const midEy = (y - midY) / ellH;
        if (Math.abs(relX) <= 1 && midEy * midEy + relX * relX <= 1) {
            isDb = true;
        }

        // Left cylinder wall
        if (x >= dbCx - dbW && x <= dbCx - dbW + 3 && y >= dbTop && y <= dbBot) {
            isDb = true;
        }

        // Right cylinder wall
        if (x >= dbCx + dbW - 3 && x <= dbCx + dbW && y >= dbTop && y <= dbBot) {
            isDb = true;
        }

        if (isDb && dist <= R) {
            rawData.push(255, 255, 255, alpha); // white
        } else {
            rawData.push(r, g, b, alpha);
        }
    }
}

const raw = Buffer.from(rawData);
const compressed = zlib.deflateSync(raw);

function crc32(buf) {
    let crc = 0xFFFFFFFF;
    const table = [];
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c;
    }
    for (let i = 0; i < buf.length; i++) {
        crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
    const typeBuf = Buffer.from(type);
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length);
    const combined = Buffer.concat([typeBuf, data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(combined));
    return Buffer.concat([lenBuf, combined, crcBuf]);
}

// IHDR
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // color type: RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdrChunk = chunk('IHDR', ihdr);
const idatChunk = chunk('IDAT', compressed);
const iendChunk = chunk('IEND', Buffer.alloc(0));

const png = Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
fs.writeFileSync('media/icon.png', png);
console.log('✅ Icon created: media/icon.png (' + png.length + ' bytes)');
