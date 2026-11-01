# -*- coding: utf-8 -*-
"""python -I unzip_msc.py <zip> <out_dir> -> extract with cp866 names (no UTF-8 flag in the archive),
refuse paths that leave out_dir; print a summary."""
import io, os, sys, zipfile

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
src, out = sys.argv[1], os.path.abspath(sys.argv[2])
z = zipfile.ZipFile(src)
n = 0
for i in z.infolist():
    name = i.filename if i.flag_bits & 0x800 else i.filename.encode('cp437').decode('cp866')
    if name.endswith('/'):
        continue
    dst = os.path.abspath(os.path.join(out, name))
    if not dst.startswith(out + os.sep):
        print('skip unsafe path', name)
        continue
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with z.open(i) as f, open(dst, 'wb') as g:
        g.write(f.read())
    n += 1
print('extracted', n, 'files into', out)
