/**
 * Blocking script injected into <head> to set data-theme before first paint.
 *
 * Without this the page paints with the default (dark) tokens, then React
 * mounts and swaps the attribute — a white flash for light-mode users on every
 * navigation. It must run synchronously in <head>, before any CSS is applied,
 * so it cannot live in a component.
 *
 * Kept deliberately tiny and dependency-free; it is inlined into the HTML.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var k='chronicle:theme',s=null;
try{s=localStorage.getItem(k)}catch(e){}
var t=(s==='light'||s==='dark')?s:(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');
var r=document.documentElement;
r.setAttribute('data-theme',t);
r.style.colorScheme=t;
}catch(e){
/* Any failure leaves the default dark theme in place, which is a valid render. */
}})();`;
