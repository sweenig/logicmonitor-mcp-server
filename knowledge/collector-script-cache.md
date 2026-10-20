# Collector Script Cache (ScriptCache)

`ScriptCache` is a key/value store inside the collector that lets a Groovy script carry data from one poll to the next. Without it, a script is stateless: every collection interval starts from nothing, and the only workaround is reading and writing files on the collector host.

## When to use it

Use it whenever a DataSource, ConfigSource, PropertySource or EventSource script needs to remember something between runs:

- **Auth tokens / sessions** - log in once, reuse the token until it expires instead of authenticating every poll.
- **Previous poll results** - store the last counter value and timestamp to compute deltas or rates from counters that only report running totals.
- **Rolling totals and windows** - accumulate sums or counts across polls.
- **Bookmarks / cursors** - remember the last log offset, event ID, page token or "since" timestamp so each poll fetches only what is new.
- **Expensive lookups** - cache results (e.g. an ID-to-name map) that rarely change.

If the data would otherwise be written to a temp file on the collector, prefer the cache.

## API

Obtain the cache object, then call methods on it.

| Method | Description |
|---|---|
| `ScriptCache.getCache()` | Returns the `ScriptCache` object used for the operations below. |
| `ScriptCache.set(String key, String value, [optional] long expireIn)` | Store a value. `expireIn` is in milliseconds (e.g. `3000`). |
| `ScriptCache.get(String key)` | Return the value for the key, or `null` if absent or expired. |
| `ScriptCache.remove(String key)` | Delete an entry. |

Notes:

- Values are **strings**. Serialize numbers, maps and lists (e.g. with `JsonOutput.toJson` / `JsonSlurper`) and parse them back after `get`.
- Per-key `expireIn` overrides the default. If omitted, the default is `collector.script.cache.timeout` in `agent.conf` (minutes, e.g. `collector.script.cache.timeout=30`).
- Always handle `null` from `get`: the entry may have expired, been removed, or the collector may have restarted. Treat a missing value as "first run" (e.g. emit no delta this poll and store the baseline).
- For tokens, set `expireIn` slightly shorter than the token's real lifetime so you re-authenticate before it lapses.

## Example: reusing an auth token

```groovy
import com.santaba.agent.util.script.ScriptCache

def cache = ScriptCache.getCache()
String token = cache.get("myapi.token")
if (token == null) {
    // authenticate, then store the token for 25 minutes
    token = fetchNewToken()
    cache.set("myapi.token", token, 25 * 60 * 1000)
}
// use token for the API calls
```

## Example: delta from a counter

```groovy
import com.santaba.agent.util.script.ScriptCache

def cache = ScriptCache.getCache()
String key = "${hostProps.get('system.deviceId')}.bytesTotal"
long current = readCounter()
long now = System.currentTimeMillis()

String prev = cache.get(key)
if (prev != null) {
    def (prevValue, prevTime) = prev.split(",")*.toLong()
    println "bytesPerSec=" + ((current - prevValue) / ((now - prevTime) / 1000))
}
cache.set(key, "${current},${now}")   // no expireIn: uses the agent.conf default
```

## Design tips

- **Namespace keys** with the device and/or instance (e.g. `<deviceId>.<instance>.<metric>`); keys are not scoped for you, so generic names can collide between devices or LogicModules.
- Pick `expireIn` deliberately for state that must survive several polls (deltas, cursors); a short default timeout would silently reset it.
- Test with `execute_groovy_script` on the target collector before deploying. Run it twice to confirm the second run sees the value stored by the first.
