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
- Time-of-day thresholds use the `alertExpr` window syntax; see `update_datasource`.
