# Minimal SoundFont 2 reader: presets -> instruments -> sample zones (key range, root key,
# tuning, loop points). Enough to pull individual instruments out of GeneralUser GS.
import struct, numpy as np
GEN = {43:'keyRange',44:'velRange',53:'sampleID',58:'overridingRootKey',54:'sampleModes',51:'coarseTune',52:'fineTune',
       41:'instrument',48:'initialAttenuation',0:'startAddrsOffset',1:'endAddrsOffset',2:'startloopAddrsOffset',3:'endloopAddrsOffset',
       4:'startAddrsCoarseOffset',12:'endAddrsCoarseOffset',45:'startloopAddrsCoarseOffset',50:'endloopAddrsCoarseOffset',
       38:'releaseVolEnv',34:'attackVolEnv',36:'decayVolEnv',37:'sustainVolEnv',17:'pan'}
class SF2:
    def __init__(s, path):
        d = open(path,'rb').read(); s.d = d
        def chunks(off, end):
            while off < end:
                cid = d[off:off+4]; n = struct.unpack('<I', d[off+4:off+8])[0]
                yield cid, off+8, n
                off += 8 + n + (n & 1)
        lists = {}
        for cid, o, n in chunks(12, len(d)):
            if cid == b'LIST': lists[d[o:o+4]] = (o+4, o+n)
        o, e = lists[b'sdta']
        for cid, oo, n in chunks(o, e):
            if cid == b'smpl': s.smpl = np.frombuffer(d[oo:oo+n], dtype='<i2')
        o, e = lists[b'pdta']; p = {}
        for cid, oo, n in chunks(o, e): p[cid.decode()] = d[oo:oo+n]
        rec = lambda b, size: [b[i:i+size] for i in range(0, len(b), size)]
        s.phdr = [(r[:20].split(b'\0')[0].decode('latin1'),)+struct.unpack('<HHH', r[20:26]) for r in rec(p['phdr'], 38)]
        s.pbag = [struct.unpack('<HH', r) for r in rec(p['pbag'], 4)]
        s.pgen = [struct.unpack('<Hh', r) for r in rec(p['pgen'], 4)]
        s.inst = [(r[:20].split(b'\0')[0].decode('latin1'), struct.unpack('<H', r[20:22])[0]) for r in rec(p['inst'], 22)]
        s.ibag = [struct.unpack('<HH', r) for r in rec(p['ibag'], 4)]
        s.igen = [struct.unpack('<Hh', r) for r in rec(p['igen'], 4)]
        s.shdr = [(r[:20].split(b'\0')[0].decode('latin1'),)+struct.unpack('<IIIIIBbHH', r[20:46]) for r in rec(p['shdr'], 46)]
    def _gens(s, bag, gen, i):
        g = {}
        for k in range(bag[i][0], bag[i+1][0]):
            op, amt = gen[k]
            if op in (43, 44): amt = (amt & 0xff, (amt >> 8) & 0xff)
            g[op] = amt
        return g
    def presets(s):
        return [(i, n, prog, bank) for i, (n, prog, bank, _) in enumerate(s.phdr[:-1])]
    def instrument_zones(s, inst_idx):
        out = []; b0, b1 = s.inst[inst_idx][1], s.inst[inst_idx+1][1]; glob = {}
        for bi in range(b0, b1):
            g = s._gens(s.ibag, s.igen, bi)
            if 53 not in g: glob = g; continue
            z = dict(glob); z.update(g); out.append(z)
        return out
    def preset_instruments(s, pidx):
        b0, b1 = s.phdr[pidx][3], s.phdr[pidx+1][3]; res = []
        for bi in range(b0, b1):
            g = s._gens(s.pbag, s.pgen, bi)
            if 41 in g: res.append((g[41], g))
        return res
    def sample(s, sid, z=None):
        name, start, end, sl, el, rate, root, corr, link, typ = s.shdr[sid]
        z = z or {}
        start += z.get(0, 0) + 32768*z.get(4, 0); end += z.get(1, 0) + 32768*z.get(12, 0)
        sl += z.get(2, 0) + 32768*z.get(45, 0); el += z.get(3, 0) + 32768*z.get(50, 0)
        x = s.smpl[start:end].astype(np.float32) / 32768.0
        rk = z.get(58, -1); rk = root if rk in (-1, 255) else rk
        tune = z.get(51, 0)*100 + z.get(52, 0) + corr   # cents
        return dict(name=name, data=x, rate=rate, root=rk, tune_cents=tune, loop=(sl-start, el-start),
                    looped=z.get(54, 0) in (1, 3), keyRange=z.get(43, (0,127)), velRange=z.get(44,(0,127)), atten=z.get(48,0)/10.0)
if __name__ == '__main__':
    import sys
    f = SF2(sys.argv[1])
    for i, n, prog, bank in f.presets():
        if any(k.lower() in n.lower() for k in sys.argv[2:]):
            print(f'preset {i}: "{n}" bank {bank} prog {prog}')
            for ii, g in f.preset_instruments(i):
                print('   inst', ii, f.inst[ii][0])
                for z in f.instrument_zones(ii):
                    sm = f.sample(z[53], z); print(f'      key {sm["keyRange"]} vel {sm["velRange"]} root {sm["root"]} {sm["rate"]}Hz len {len(sm["data"])/sm["rate"]:.2f}s loop={sm["looped"]} {sm["name"]}')
