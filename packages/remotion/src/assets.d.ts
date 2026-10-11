/** Font files imported as URLs (Remotion's webpack and Vite both emit them as assets). */
declare module '*.woff2' {
  const url: string;
  export default url;
}
