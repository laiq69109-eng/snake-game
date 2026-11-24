// The normal server uses /room/CODE. A static host keeps invitations on its own index page.
const external=document.querySelector('meta[name="atlas-room-service"]')?.content;
export const roomOrigin=external ? new URL(external).origin : location.origin;
export function roomLink(code){
  if(!external)return new URL('/room/'+code,location.origin).href;
  const url=new URL(location.href);
  url.searchParams.set('room',code);
  url.hash='';
  return url.href;
}
export function homeLink(){
  if(!external)return '/';
  const url=new URL(location.href);
  url.searchParams.delete('room');url.hash='';
  return url.href;
}
export function invitedRoom(){
  const value=external ? new URL(location.href).searchParams.get('room') : location.pathname.split('/room/')[1]?.replace(/\/$/,'');
  return /^[A-Z0-9]{6}$/i.test(value||'')?value.toUpperCase():null;
}
export function socketLink(){
  const url=new URL('/socket',roomOrigin);
  url.protocol=url.protocol==='https:'?'wss:':'ws:';
  return url.href;
}
