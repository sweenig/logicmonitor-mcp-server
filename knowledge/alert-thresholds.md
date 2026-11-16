# Alert thresholds: trigger and clear intervals count poll cycles

Read this before setting `alertExpr`, `alertTransitionInterval` or `alertClearTransitionInterval` on a datapoint (`create_datasource`, `update_datasource`, `update_resource_group_datasource_thresholds`).

## The rule

`alertTransitionInterval` (trigger) and `alertClearTransitionInterval` (clear) count poll **cycles after the first poll**, not polls.

- **0 (the default)** = alert at the first poll that violates the threshold.
- **N above 0** = the threshold must stay violated for N further cycles. That is N+1 consecutive polls, spanning N x the collection interval.
- **Clear** works the same way: with `alertClearTransitionInterval` N the value must stay normal for N further cycles before the alert clears.
- Minutes = interval x collection interval in minutes (`collectInterval` is in seconds on the DataSource).

At a 5-minute poll:

| Trigger | Polls needed | Alert after |
|---|---|---|
| 0 | 1 | at once |
| 1 | 2 | 5 minutes |
| 2 | 3 | 10 minutes |
| 5 | 6 | 25 minutes |

A clear interval of 12 = 13 normal polls = 60 minutes.

## The mistake to avoid

Reading "1" as "one poll". A datapoint with threshold `> 0` and trigger interval 1 needs two consecutive violating polls, so an error that shows up in a single poll never alerts. To alert on **any occurrence** of a count or delta, use trigger interval 0. The tools warn (they do not refuse) when a `> 0` threshold is saved with a trigger interval above 0.

To alert after a duration instead (for example "violated for 30 minutes at a 5-minute poll"), set the trigger to duration / poll interval: 30 / 5 = 6 (7 consecutive polls, the first plus six more).

## How to check what is set

`get_datasource` and `get_resource_group_datasource_thresholds` return `alertIntervals` next to each datapoint, for example `trigger 1 = alerts after 2 consecutive polls (5 minutes); clear 12 = clears after 13 consecutive polls (60 minutes)`.

## Where this comes from

LogicMonitor's documentation defines the intervals as consecutive polling cycles; a community answer states that the count excludes the initial poll. Observed on a live portal (Cenlar Zip File parser, 2026-11-10): a count datapoint with threshold `> 0` and trigger interval 1 was 2 for one poll and 0 on the next, and no alert was raised.

## Related

- Changing a threshold only affects alerts raised afterwards; an open alert keeps the threshold it was raised with.
- Time-of-day thresholds: see the next section.

## Time-of-day thresholds

`alertExpr` takes a daily clock window natively. Do not gate the value in a DataSource script to mute alerts overnight.

```
> 5400 7200                                                             plain: operator, then warn error critical
( 06:30 22:30 ) = 1 2 3 timezone=America/New_York                       one window
( 06:30 22:30 ) = 1 2 3 , ( 00:00 01:30 ) < 3 2 1 timezone=America/New_York   two windows
```

Windows are `( START END )` in 24h `HH:mm`, separated by ` , `, each with its own operator and values; a single `timezone=` (IANA zone id) closes the string. Same field on the datapoint (`update_datasource`) and the group override (`update_resource_group_datasource_thresholds`).

Instead of writing the string, pass `alertThresholds` (and `timezone`) on a datapoint or a `dpConfig` entry:

```json
{"alertThresholds": [
  {"window": {"start": "06:30", "end": "22:30"}, "operator": "=", "warn": 1, "error": 2, "critical": 3},
  {"window": {"start": "00:00", "end": "01:30"}, "operator": "<", "warn": 3, "error": 2, "critical": 1}
 ], "timezone": "America/New_York"}
```

The tool validates the times, operator (`> >= < <= = !=`), values (levels are positional: error needs warn, critical needs error) and timezone, and sends the string above. Raw `alertExpr` still works. Reads return `alertExprParsed` (and `globalAlertExprParsed` at group level) next to the raw string when a window or timezone is present.

Verified on a live portal (2026-11-16, haservicestest, scratch resource with a constant value of 10 and threshold `> 5`): a window whose start is after its end wraps over midnight and alerts on both sides of it (`( 21:00 20:00 )` and `( 23:00 22:30 )` both alerted at 22:10 UTC), so do not split it at 00:00; a time inside the excluded gap of a wrap window (`( 23:00 21:30 )` at 22:10) and a window that does not contain the time do not alert; `timezone=UTC` was honoured while the portal's own clock was 6 hours off; `24:00` as END and a string with no `timezone=` are accepted. Also verified live (2026-11-16, haservicestest, same method, 60 s poll):

- **END is exclusive at the minute.** With `( 00:00 22:20 )` the alert opened on the first poll and cleared at the poll at 22:20:50 UTC, although the value still violated the threshold. So an alert that is open when its window closes clears at the next poll (with clear interval 0).
- **Overlapping windows: the first matching window decides**, not the most severe. The same two windows, a warn-only one and a warn/error/critical one, gave a warning when the warn-only one came first and a critical when it came second. Order them with the one you want first.
- **One `timezone=` covers every window.** With `timezone=Asia/Tokyo` the alert fired whether the matching window was first or last in the string.
- **A group override replaces the DataSource default.** A window override (`( 03:00 04:00 )`) on an always-on default stopped it alerting at 22:10 UTC; a window override that contains the time on a default that does not match made it alert.

- **Daylight saving time is honoured.** The zone's current offset is used, not its standard one: with `Australia/Sydney` (on daylight time, UTC+11, on 2026-11-16) a window matching Sydney's local time alerted and a window one hour earlier did not; with `America/New_York` (on standard time, UTC-5) the standard-time window alerted and the summer-time one did not. So write windows in the zone's local wall-clock time and let the portal handle the offset.

Still not verified: what a window does on the day the clock actually changes (the skipped or repeated hour), because no zone changes its clock before 2027; and how a group override with a different operator from the default behaves (the replace rule above suggests nothing is merged).
