<?php

/**
 * Minimal read-only ZIP archive reader in pure PHP.
 *
 * Production runs PHP 7.2 WITHOUT the zip extension, so the song-image import
 * cannot rely on ZipArchive. This reader covers what a "folder of images"
 * archive needs: the central directory, stored (method 0) and deflated
 * (method 8) entries. Not supported: encryption, ZIP64 (archives or entries
 * over 4 GB, more than 65535 entries), other compression methods — such
 * entries are reported as unreadable (getFromIndex() returns false).
 *
 * The public surface mirrors the subset of ZipArchive the import uses, so the
 * caller can work with either object:
 *
 *   $zip = new ZipReader();
 *   if ($zip->open($path) !== true) { ... }          // true or an error string
 *   for ($i = 0; $i < $zip->numFiles; $i++) {
 *       $name = $zip->getNameIndex($i);               // raw bytes, as stored
 *       $data = $zip->getFromIndex($i);               // string or false
 *   }
 *   $zip->close();
 */
class ZipReader
{
    const SIG_EOCD    = "PK\x05\x06";
    const SIG_CENTRAL = "PK\x01\x02";
    const SIG_LOCAL   = "PK\x03\x04";

    /** @var int Number of entries (mirrors ZipArchive::$numFiles). */
    public $numFiles = 0;

    /** @var resource|null */
    private $fh = null;

    /** @var array[] Central-directory entries. */
    private $entries = [];

    /**
     * Open an archive.
     * @return true|string  true on success, otherwise a short error message
     */
    public function open($path)
    {
        $this->close();

        $size = @filesize($path);
        if ($size === false || $size < 22) {
            return 'not a zip file';
        }
        $fh = @fopen($path, 'rb');
        if (!$fh) {
            return 'cannot open file';
        }

        // The end-of-central-directory record (22 bytes + optional comment of
        // up to 65535 bytes) sits at the very end of the file.
        $tailLen = (int)min($size, 22 + 65535);
        fseek($fh, $size - $tailLen);
        $tail = fread($fh, $tailLen);
        $pos  = ($tail === false) ? false : strrpos($tail, self::SIG_EOCD);
        if ($pos === false) {
            fclose($fh);
            return 'end of central directory not found';
        }
        $eocd = unpack(
            'vdisk/vcdDisk/vdiskEntries/ventries/VcdSize/VcdOffset/vcommentLen',
            substr($tail, $pos + 4, 18)
        );
        if ($eocd['entries'] === 0xFFFF || $eocd['cdOffset'] === 0xFFFFFFFF || $eocd['cdSize'] === 0xFFFFFFFF) {
            fclose($fh);
            return 'ZIP64 archives are not supported';
        }

        fseek($fh, $eocd['cdOffset']);
        $cd = ($eocd['cdSize'] > 0) ? fread($fh, $eocd['cdSize']) : '';
        if ($cd === false || strlen($cd) !== $eocd['cdSize']) {
            fclose($fh);
            return 'truncated central directory';
        }

        $entries = [];
        $off     = 0;
        for ($i = 0; $i < $eocd['entries']; $i++) {
            if (substr($cd, $off, 4) !== self::SIG_CENTRAL) {
                fclose($fh);
                return 'corrupt central directory';
            }
            $h = unpack(
                'vmadeBy/vneeded/vflags/vmethod/vtime/vdate/Vcrc/VcompSize/VuncompSize'
                . '/vnameLen/vextraLen/vcommentLen/vdiskStart/vintAttr/VextAttr/VlocalOffset',
                substr($cd, $off + 4, 42)
            );
            $entries[] = [
                'name'        => substr($cd, $off + 46, $h['nameLen']),
                'flags'       => $h['flags'],
                'method'      => $h['method'],
                'crc'         => $h['crc'],
                'compSize'    => $h['compSize'],
                'uncompSize'  => $h['uncompSize'],
                'localOffset' => $h['localOffset'],
            ];
            $off += 46 + $h['nameLen'] + $h['extraLen'] + $h['commentLen'];
        }

        $this->fh       = $fh;
        $this->entries  = $entries;
        $this->numFiles = count($entries);
        return true;
    }

    /** Entry name exactly as stored in the archive (raw bytes; $flags is accepted for ZipArchive call compatibility). */
    public function getNameIndex($index, $flags = 0)
    {
        return isset($this->entries[$index]) ? $this->entries[$index]['name'] : false;
    }

    /** True when the entry name is flagged as UTF-8 (general purpose bit 11). */
    public function isUtf8Name($index)
    {
        return isset($this->entries[$index]) && ($this->entries[$index]['flags'] & 0x800) !== 0;
    }

    /**
     * Uncompressed content of an entry, or false when it cannot be read
     * (encrypted, unsupported method, ZIP64, truncated or corrupt data).
     */
    public function getFromIndex($index)
    {
        if (!$this->fh || !isset($this->entries[$index])) {
            return false;
        }
        $e = $this->entries[$index];
        if (($e['flags'] & 0x1) !== 0) {
            return false; // encrypted
        }
        if ($e['compSize'] === 0xFFFFFFFF || $e['uncompSize'] === 0xFFFFFFFF) {
            return false; // ZIP64 sizes
        }

        // The local header repeats name/extra fields whose lengths may differ
        // from the central directory — the data starts right after them.
        fseek($this->fh, $e['localOffset']);
        $lh = fread($this->fh, 30);
        if ($lh === false || strlen($lh) !== 30 || substr($lh, 0, 4) !== self::SIG_LOCAL) {
            return false;
        }
        $l = unpack('vnameLen/vextraLen', substr($lh, 26, 4));
        fseek($this->fh, $e['localOffset'] + 30 + $l['nameLen'] + $l['extraLen']);
        $raw = ($e['compSize'] > 0) ? fread($this->fh, $e['compSize']) : '';
        if ($raw === false || strlen($raw) !== $e['compSize']) {
            return false;
        }

        if ($e['method'] === 0) {
            $data = $raw;
        } elseif ($e['method'] === 8) {
            $data = @gzinflate($raw);
            if ($data === false) {
                return false;
            }
        } else {
            return false; // unsupported compression method
        }

        if (strlen($data) !== $e['uncompSize']) {
            return false;
        }
        // CRC-32 check (compared as unsigned so 32-bit builds behave too).
        if (sprintf('%u', crc32($data)) !== sprintf('%u', $e['crc'])) {
            return false;
        }
        return $data;
    }

    public function close()
    {
        if ($this->fh) {
            fclose($this->fh);
        }
        $this->fh       = null;
        $this->entries  = [];
        $this->numFiles = 0;
        return true;
    }
}
