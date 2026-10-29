import { describe, expect, it } from 'vitest'
import { toBase64Url } from './bytes'
import {
  connectHeaders,
  eventsUrl,
  parseConnectRequest,
  parseWebSocketProtocols,
  sendUrl,
  webSocketProtocols,
  webSocketUrl,
  WS_SUBPROTOCOL,
  type ConnectParams,
} from './connect-url'

const params: ConnectParams = {
  base: 'https://192.168.4.20:8485/',
  sessionId: 'session-00000000000000',
  joinToken: new Uint8Array(16).fill(1),
  clientId: 'playerA-00000000000000',
  resumeToken: new Uint8Array(16).fill(2),
}
const J = toBase64Url(params.joinToken)
const R = toBase64Url(params.resumeToken!)

describe('connection URLs and tokens', () => {
  it('the WebSocket URL carries only the client id; the tokens go in the subprotocol list', () => {
    const url = new URL(webSocketUrl(params))
    expect(url.protocol).toBe('wss:')
    expect(url.host).toBe('192.168.4.20:8485')
    expect(url.pathname).toBe('/v1/sessions/session-00000000000000/ws')
    expect([...url.searchParams.keys()]).toEqual(['client'])
    expect(url.searchParams.get('client')).toBe(params.clientId)
    expect(webSocketProtocols(params)).toEqual([WS_SUBPROTOCOL, `j.${J}`, `r.${R}`])
    expect(webSocketProtocols({ ...params, resumeToken: undefined })).toEqual([
      WS_SUBPROTOCOL,
      `j.${J}`,
    ])
  })

  it('uses ws: for a plain http page', () => {
    expect(webSocketUrl({ ...params, base: 'http://127.0.0.1:8485' })).toMatch(
      /^ws:\/\/127\.0\.0\.1:8485\//,
    )
  })

  it('the stream and send URLs carry the client id (and the resume index); the tokens go in headers', () => {
    const events = new URL(eventsUrl(params, 42))
    expect(events.pathname).toBe('/v1/sessions/session-00000000000000/events')
    expect([...events.searchParams.keys()].sort()).toEqual(['after', 'client'])
    expect(events.searchParams.get('after')).toBe('42')
    const send = new URL(sendUrl(params))
    expect(send.pathname).toBe('/v1/sessions/session-00000000000000/send')
    expect([...send.searchParams.keys()]).toEqual(['client'])
    expect(connectHeaders(params)).toEqual({ 'x-as-join': J, 'x-as-resume': R })
    expect(connectHeaders({ ...params, resumeToken: undefined })).toEqual({ 'x-as-join': J })
  })

  it('no URL ever contains a token or a key', () => {
    for (const url of [webSocketUrl(params), eventsUrl(params, 0), sendUrl(params)]) {
      expect(url).not.toContain(J)
      expect(url).not.toContain(R)
    }
  })

  it('servers parse the subprotocol header (one header, a list, or comma-joined)', () => {
    expect(parseWebSocketProtocols(`${WS_SUBPROTOCOL}, j.${J}, r.${R}`)).toEqual({
      version: true,
      joinToken: J,
      resumeToken: R,
    })
    expect(parseWebSocketProtocols([WS_SUBPROTOCOL, `j.${J}`])).toEqual({
      version: true,
      joinToken: J,
    })
    expect(parseWebSocketProtocols(undefined)).toEqual({ version: false })
    expect(parseWebSocketProtocols('j.not a token!')).toEqual({ version: false })
  })

  it('parses a WebSocket upgrade: client from the query, tokens from the protocols', () => {
    const r = parseConnectRequest({
      search: new URL(webSocketUrl(params)).search,
      protocols: webSocketProtocols(params),
    })
    expect(r).toEqual({
      ok: true,
      request: { clientId: params.clientId, joinToken: J, resumeToken: R, after: 0 },
    })
    expect(parseConnectRequest({ search: '?client=c', protocols: ['other.v9', `j.${J}`] })).toEqual(
      { ok: false, reason: 'BAD_PROTOCOL' },
    )
    expect(parseConnectRequest({ search: '?client=c', protocols: [WS_SUBPROTOCOL] })).toEqual({
      ok: false,
      reason: 'MISSING_JOIN',
    })
  })

  it('parses a stream or send request: client and index from the query, tokens from the headers', () => {
    const r = parseConnectRequest({
      search: new URL(eventsUrl(params, 7)).search,
      headers: connectHeaders(params),
    })
    expect(r).toEqual({
      ok: true,
      request: { clientId: params.clientId, joinToken: J, resumeToken: R, after: 7 },
    })
    const viaHeaders = parseConnectRequest({
      search: '?client=c&after=x',
      headers: new Headers({ 'X-AS-Join': J }),
    })
    expect(viaHeaders).toEqual({ ok: true, request: { clientId: 'c', joinToken: J, after: 0 } })
    expect(parseConnectRequest({ search: '?after=1', headers: connectHeaders(params) })).toEqual({
      ok: false,
      reason: 'MISSING_CLIENT',
    })
  })

  it('refuses any token in the query string, whatever else the request carries', () => {
    for (const bad of [
      `?client=c&j=${J}`,
      `?client=c&r=${R}`,
      '?client=c&token=x',
      '?client=c&join=x',
    ]) {
      expect(parseConnectRequest({ search: bad, headers: connectHeaders(params) })).toEqual({
        ok: false,
        reason: 'TOKEN_IN_QUERY',
      })
      expect(parseConnectRequest({ search: bad, protocols: webSocketProtocols(params) })).toEqual({
        ok: false,
        reason: 'TOKEN_IN_QUERY',
      })
    }
  })
})
