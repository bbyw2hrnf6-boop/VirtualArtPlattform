export function Logo({ dark = false }: { dark?: boolean }) {
  return <button className={`logo ${dark ? 'logo--dark' : ''}`} onClick={() => { location.hash = '/'; }} aria-label="AURA home"><span>A</span><b>AURA</b></button>;
}
