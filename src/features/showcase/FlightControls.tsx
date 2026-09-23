import type { VisitorTourState } from '../gallery/visitorTourState';
import type { ObsidianControls } from './ObsidianScene';

export function FlightControls({ state, controls, duration, reduced, house=false }: {
  state: VisitorTourState; controls: { current: ObsidianControls | null }; duration: number; reduced: boolean; house?: boolean;
}) {
  return <div className="forest-house__flight" data-flight={state.status}>
    {state.status==='idle'?<button disabled={reduced} onClick={()=>controls.current?.flight('start')}>
      {reduced?'Still views in Guided tour':`${house?'House':'Exhibition'} flight · ${duration} sec ↗`}
    </button>:<>
      <span>{state.currentLabel}</span>
      <button onClick={()=>controls.current?.flight('pause')}>{state.status==='paused'?'Resume flight':'Pause flight'}</button>
      <button onClick={()=>controls.current?.flight('stop')}>Exit flight</button>
      <input type="range" aria-label={`${house?'House':'Exhibition'} flight position`} min={0} max={1000} value={Math.round(state.progress*1000)} onChange={e=>controls.current?.flight(Number(e.target.value)/1000)}/>
    </>}
  </div>;
}
