import {afterEach,describe,expect,it,vi} from 'vitest';
import {MusicPlayer} from './music';
import {mockAudio} from './audio-mock';
afterEach(()=>vi.useRealTimers());
describe('approved soundtrack lifecycle',()=>{
  it('uses one scheduler and releases voices on mute/hide',async()=>{
    vi.useFakeTimers();const a=mockAudio(),p=new MusicPlayer(a.get);
    await Promise.all([p.start(),p.start()]);expect(p.playing).toBe(true);expect(vi.getTimerCount()).toBe(1);expect(p.activeVoices).toBeGreaterThan(0);
    await p.start();expect(vi.getTimerCount()).toBe(1);p.stop();expect(p.activeVoices).toBe(0);expect(vi.getTimerCount()).toBe(0);
    expect(a.ctx.createOscillator.mock.results.every(r=>r.value.stop.mock.calls.length>0)).toBe(true);
  });
  it('does not catch up missed notes after a throttled timer',async()=>{
    vi.useFakeTimers();const a=mockAudio(),p=new MusicPlayer(a.get);await p.start();
    const n=a.ctx.createOscillator.mock.calls.length;a.ctx.currentTime=600;vi.advanceTimersByTime(50);
    expect(a.ctx.createOscillator.mock.calls.length-n).toBeLessThan(20);p.stop();
  });
  it('cannot restart while an old unlock is pending',async()=>{
    vi.useFakeTimers();const a=mockAudio();let resume=()=>{};
    a.ctx.resume.mockImplementation(()=>new Promise<void>(resolve=>{resume=resolve;}));
    const p=new MusicPlayer(a.get),pending=p.start();p.stop();resume();await pending;
    expect(p.playing).toBe(false);expect(vi.getTimerCount()).toBe(0);expect(a.ctx.createOscillator).not.toHaveBeenCalled();
  });
  it('retries denied audio without an unhandled rejection',async()=>{
    vi.useFakeTimers();const a=mockAudio();a.ctx.resume.mockRejectedValueOnce(new Error('autoplay denied'));
    const p=new MusicPlayer(a.get);await p.start();expect(p.playing).toBe(false);await p.start();expect(p.playing).toBe(true);p.stop();
  });
  it('fades out before scheduling a new score, and stops ambience on returning to camp',async()=>{
    vi.useFakeTimers();const a=mockAudio(),p=new MusicPlayer(a.get);await p.start();
    p.setScene({track:'boss',ambience:'hollowglass',light:.15});expect(p.currentTrack).toBe('camp');
    a.ctx.currentTime=.49;vi.advanceTimersByTime(50);expect(p.currentTrack).toBe('camp');
    a.ctx.currentTime=.51;vi.advanceTimersByTime(50);expect(p.currentTrack).toBe('boss');
    p.setScene({track:'camp',ambience:null,light:1});p.stop();expect(p.activeVoices).toBe(0);
  });
});
