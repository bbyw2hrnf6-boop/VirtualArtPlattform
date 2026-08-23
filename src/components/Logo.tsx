import { PRODUCT_BRAND } from "../config/brand";

export function Logo({ dark = false }: { dark?: boolean }) {
  return <button className={`logo ${dark ? 'logo--dark' : ''}`} onClick={() => { location.hash = '/'; }} title={`${PRODUCT_BRAND.name} home`}><span aria-hidden="true"/><b>{PRODUCT_BRAND.name}</b></button>;
}
