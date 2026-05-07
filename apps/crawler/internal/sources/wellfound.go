package sources

// Wellfound (formerly AngelList Talent) does not expose a public job feed —
// every page on wellfound.com is fronted by Datadome, which serves a JS
// challenge / 403 to non-browser clients (curl, Go's http.Client, headless
// crawlers without full browser fingerprinting). Their internal GraphQL is
// session-gated, and there is no `__NEXT_DATA__` blob on the public list
// endpoints (the React app fetches everything client-side through challenged
// XHRs).
//
// Until we either (a) acquire an authorized partner key, (b) integrate a
// captcha-solving proxy, or (c) commit to running headless browsers per
// company, this adapter intentionally has no implementation. Operators looking
// for startup-job coverage should rely on workatastartup (YC) and remoteok
// in the meantime.
