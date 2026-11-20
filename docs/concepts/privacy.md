# Privacy by design

A playground map is used by parents, often on a phone, often near home. Which playgrounds someone looks at, and where they search, says a lot about where their children are. spieli is built so that this information goes as few places as possible, and so that the places it does go are named.

This page explains the approach. The service-by-service detail is in [External Services](../reference/external-services.md).

## One address instead of many

A typical web map loads its background tiles from a tile provider, its search from a geocoder, its photos from a photo host and its reviews from a review service. Each of them receives the visitor's IP address and learns what that visitor is looking at.

In a default spieli deployment, the browser talks to **one** server: the spieli instance it opened (on a hub, also the servers of the regions on screen, see [below](#federation-keeps-it-split)). That instance fetches everything else on the visitor's behalf and keeps a cache:

```
                      ┌─────────────────────────────┐
                      │       spieli instance       │      background map
  your browser ─────► │                             │ ───► search (Nominatim)
     (only this       │   app · API · cache         │      photos (Wikimedia Commons)
      connection)     │                             │      reviews (Mangrove)
                      └─────────────────────────────┘
                                  fetches on your behalf,
                                  without your address
```

The outbound requests carry no cookies, no referrer, no browser language and no forwarded IP address. The services see a spieli server, not a visitor. And many visitors share one cached answer: the background map of Fulda is fetched once, not once per family.

If a service cannot be reached, the feature fails instead of quietly falling back to a direct connection. A fallback would reveal exactly the addresses the proxy is there to protect, at the moment nobody is watching.

## Nothing is written down

The server keeps no access log at all, not for the map, not for the API, not for the proxied services. Proxying moves the visitor's request stream onto the operator's server, and recording it there would create the very trail the proxy removes. Only errors are logged. An operator who puts their own reverse proxy in front of spieli has to make sure it does not log those requests one layer up.

spieli sets no cookies, runs no analytics and has no user accounts.

## What still leaves, and when

Three things still connect the browser to a third party. Each is deliberate, and each happens only in a specific situation:

| What | When | Why it is not proxied |
|---|---|---|
| Panoramax street-level photo **thumbnails** | When you open a playground that has street-level photos | The photo service redirects to hosts that change per installation; a proxy cannot follow them |
| The Panoramax **viewer** | Only when you click the thumbnail to open it, and only until you close it | It is a full application from another site; running it under spieli's address would hand it spieli's privileges |
| An OpenStreetMap **note** ("Missing a playground?") | Only when you press Send, and a sent hint's status only when you tap its pin | Sent through one server, every anonymous note would come from one address, which is what OpenStreetMap's spam protection blocks |

Links to MapComplete, OpenStreetMap or Wikidata transfer nothing until they are clicked.

Panel sections that start closed contact nothing until they are opened. Reviews start closed.

## What stays in your browser

spieli stores a few things in the browser itself. None of them is sent anywhere:

| What | Why | When |
|---|---|---|
| Whether mapping detail is on | So the map looks the same next time | When you switch it |
| Number of hints sent in this session | Limits hints to three per session | When you send one; cleared when the tab closes |
| Your sent hints, to show their status | So you can see whether someone added the playground | Only if you tick the box to keep them; off by default |
| A key pair for reviews | It is your identity to Mangrove, so your reviews can be signed | Only when you write your first review |

## Federation keeps it split

In a [federation](federation.md), the browser fetches each region's playgrounds from that region's own server. Once regions are run by different people, no single operator sees every region a visitor looks at.

## The operator decides, and the privacy page follows

An operator can switch any proxy off, or use a third-party background map instead of the cached one. That is a legitimate choice, but it is never silent: the instance generates its privacy page and its Content Security Policy from the same configuration, so a service that is contacted directly is also named on the privacy page and allowed in the policy. Neither is hard-coded.

That is also why we do not write that spieli "does not track anyone". What a given instance does depends on how it is configured. What spieli guarantees is that the default is as quiet as we could make it, and that every deviation from it shows up where visitors can read it.

## Where to go next

| I want to… | Go to… |
|---|---|
| See every external service and how it is reached | [External Services](../reference/external-services.md) |
| Switch a proxy off, or size the cache | [Configuration → External-service proxies](../ops/configure.md#external-service-proxies) |
| Understand the Content Security Policy | [Security → nginx security headers](../ops/security.md#nginx-security-headers) |
| Write the imprint and privacy notice for my instance | [Host a Region → Legal and privacy](../getting-started/host-a-region.md#legal-and-privacy) |
