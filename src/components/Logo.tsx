export function Logo({ dark = false }: { dark?: boolean }) {
  return <button className={`logo ${dark ? 'logo--dark' : ''}`} onClick={() => { location.hash = '/'; }} title="AURA home"><span aria-hidden="true"/><b>AURA</b></button>;
}
