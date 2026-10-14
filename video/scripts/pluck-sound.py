# 輪ゴムをはじく音（Karplus-Strong）。CG の放す時刻に合わせる
import numpy as np, wave, sys
sr=48000; dur=9.0; n=int(sr*dur)
out=np.zeros(n)
rng=np.random.default_rng(7)
def ks(f, secs, bright):
    N=int(sr/f); buf=rng.uniform(-1,1,N)
    for _ in range(2): buf=0.5*(buf+np.roll(buf,1))
    m=int(sr*secs); y=np.zeros(m); idx=0
    for i in range(m):
        y[i]=buf[idx]; nxt=(idx+1)%N
        buf[idx]=0.997*(bright*buf[idx]+(1-bright)*buf[nxt]); idx=nxt
    return y
for at,pull in [(1.1,0.009),(3.2,0.014),(5.3,0.006),(7.2,0.016)]:
    a=pull/0.016
    y=ks(220*(1+(pull-0.009)*1.5), 1.8, 0.5)*a
    t=np.arange(len(y))/sr
    y*=np.exp(-t*3.2)
    y+=0.25*a*np.sin(2*np.pi*140*t)*np.exp(-t*18)
    s=int(at*sr); e=min(n,s+len(y)); out[s:e]+=y[:e-s]
noise=rng.normal(0,1,n)
room=np.convolve(noise,np.ones(400)/400,mode='same')*0.06+rng.normal(0,0.0025,n)
out=out*0.55+room
out/=max(1,np.abs(out).max()/0.8)
with wave.open(sys.argv[1],'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((out*32767).astype(np.int16).tobytes())
print('ok')
