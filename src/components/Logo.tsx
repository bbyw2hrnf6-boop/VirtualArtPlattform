import { PRODUCT_BRAND } from "../config/brand";
import { applicationRootUrl } from "../services/spaceRoutes";

export function Logo({ dark = false }: { dark?: boolean }) {
  return <button className={`logo ${dark ? 'logo--dark' : ''}`} onClick={() => { location.assign(applicationRootUrl(location.href)); }} title={`${PRODUCT_BRAND.name} home`}><span aria-hidden="true"/><b>{PRODUCT_BRAND.name}</b></button>;
}
