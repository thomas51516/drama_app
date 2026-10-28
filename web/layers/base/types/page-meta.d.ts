declare module '#app' {
  interface PageMeta {
    /** Page reachable without a session (e.g. /login). Defaults to false. */
    public?: boolean
  }
}

export {}
