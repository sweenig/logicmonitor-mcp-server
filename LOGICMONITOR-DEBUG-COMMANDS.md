# LogicMonitor Collector Debug Command Reference

LogicMonitor collectors expose a "debug command" facility — the same interactive console available in the collector's built-in Debug Command Console UI — over the REST API's `/debug` endpoints. It lets you run one-off diagnostic commands, execute Groovy/Java/etc. scripts, inspect collector-internal task state, and test protocol connectivity (SNMP, JDBC, JMX, HTTP, ESX, NetApp, Xen, ...) directly against a collector and, for many commands, a specific monitored device.

This MCP server exposes the facility generically via two tools:

- **`execute_debug_command`** — `{collectorId, cmdline}`. Runs a command. Quick commands (like `help`) return their output synchronously in the `output` field. Longer-running or session-based commands instead return a `sessionId`/`cmdContext`, which must be polled.
- **`get_debug_command_result`** — `{id, collectorId}`. Polls for output using the `sessionId`/`cmdContext` from a prior `execute_debug_command` call.

Both tools are classified read-write (`readOnlyHint: false`), since `cmdline` can execute arbitrary code/commands on the collector host with the collector process's privileges — treat them with the same care as shell access to that machine.

Every command below is discoverable at runtime via `execute_debug_command({collectorId, cmdline: "help"})` (full list) or `cmdline: "help <command>"` (usage for one command) — this document is simply a durable, organized capture of that output for `collectorId: 129` (`haservicestest` portal) at the time it was generated, so it doesn't need to be re-fetched interactively every time.

---

## Scripting & Execution

Run arbitrary code/scripts or protocol queries directly against a host or the collector's own JVM.

### !groovy
executing groovy script. scriptPath is an absolute path or a path relative `<agentRoot>/bin`
```
Usage: 
    !groovy [options] scriptFilePath
    !groovy [options] \nscriptbody
Options:
    timeout: timeout in seconds, default 180 seconds
    runner: where to run the script. Runner must be agent or sse, and agent is the default runner
    hostId: send which host(in the portal) properties to groovy runner.
    h: indicates which host(in the collector) the hostProps will bound to
Arguments:
    scriptFilePath: specify the script path in collector side for executing
    scriptbody: embedded script body from the !groovy popup window
```

### !posh
execute a PowerShell script on the collector's hosting machine (Windows-only — Windows-specific equivalent of `!groovy`)
```
Usage: !posh [timeout=timeoutInSeconds] <scriptPath> 
scriptPath is an absolute path or a path relative <agentRoot>/bin.
Options:
    hostId: send which host(in the portal) properties to groovy runner.
example: !posh ../lib/test.ps1
this example will executing $agentroot/lib/test.ps1
```
(Note: fetched from a Windows collector — `!posh` is registered on every collector regardless of OS, but returns `"!posh is not supported on linux"` when run against a Linux collector like the one used for the rest of this document.)

### !healthCheckV2
executing healthCheck groovy script, use for internal purpose only
```
Usage: 
    !healthCheckV2 jsonObject
Arguments:
    jsonObject: Contains the script body for the healthcheck script and verification params
example: 
   !healthCheckV2 {"signAlgorithm":"","region":"","signature":"","keyID":"","scriptBody":"","scriptName":""}
```

### !java
execute java command on agent's hosting machine
```
(Falls through to the underlying `java --help` text, not a custom LM usage string.)
Usage: java [options] <mainclass> [args...]
           (to execute a class)
   or  java [options] -jar <jarfile> [args...]
           (to execute a jar file)
   or  java [options] -m <module>[/<mainclass>] [args...]
       java [options] --module <module>[/<mainclass>] [args...]
           (to execute the main class in a module)
   or  java [options] <sourcefile> [args]
           (to execute a single source-file program)
[...standard JVM launcher options, e.g. -cp, -classpath, -p/--module-path, -D<name>=<value>, -verbose, -version, -ea/-da, -agentlib, -javaagent, @argument files, etc. -- run `help !java` on a collector for the full listing.]
```

### !jcmd
execute jcmd command on collector
```
Usage:!jcmd [timeout=timeoutInSecForSSE] [runner=sse.default|sse.collector|collector] [options] operation

runner: sse.default   - the default sse processes
        sse.collector - the sse processes for collector scripts
        collector     - collector agent process, this is the default value
Operations:
	[checkCommercialFeatures, unlockCommercialFeatures, listCommandLine, listVMFlags, dumpThread, jfrStart, jfrCheck, jfrDump, jfrStop]

checkCommercialFeatures: Check if the commercial features are enabled
unlockCommercialFeatures: unlock the commercial features
listCommandLine: Print the command line used to start this JVM
listVMFlags   : Print VM flag options and their current values
dumpThread    : Print all stack with stackTrace
	filename      : [optional] dump threads into given file
	locks         : [optional] print java.util.concurrent locks (BOOLEAN, false)
	timeout       : [optional] timeout in seconds
	(Example: !jcmd locks=true filename=threads.dump dumpThread)
jfrStart      : Start a new JFR recording
	duration/delay/filename/maxage/name/dumponexit/maxsize options
	(Example: !jcmd duration=10m delay=10s filename=test.jfr jfrStart)
jfrCheck      : Check running JFR recording(s) (name, recording, verbose options)
jfrDump       : Copies JFR recording to a file (filename, compress, name, recording, timeout options)
jfrStop       : Stops a JFR recording (discard, filename, compress, name, recording, timeout options)
```

### !http
send a HTTP request and returns the response
```
Usage: !http: send a HTTP request to a host and print the response
!http [username=xxx [password=yyy]] [followRedirect=true|false] [method=GET| POST| PUT] [version=1| 1.1] [timeout=<seconds>] url [-h "<header json>"] [-b "<body json>"]
example(GET): !http http://www.google.com/index.html or !http method=GET http://www.google.com/index.html
example(POST): !http method=POST http://www.google.com/index.html -h "{"Content-type": "application/json"}" -b "{"key" : "value"}"
example(PUT): !http method=PUT http://www.google.com/index.html -h "{"Content-type": "application/json"}" -b "{"key" : "value"}"
```

### !jdbc
execute a sql for the given host
```
Usage: !jdbc [auth=login|integrated] [username=xxx [password=yyy]] url='<jdbc:mysql://host:port/database?user=xxx&password=yyy>' sql
```

### !jmx
query a jmx path for the given host or url
```
Usage: !jmx h=host [mbean=mbeanobject] [func=path|get] [port=9003] [u=xxxx] [p=yyy] [url=jmxServiceUrl] [proto=rmi|mp|remoting] [timeout=seconds] [mode=single|batch] jmxPath1 [jmxPath2 ... jmxPathN]
       when func=get, the jmx path must contains attribute without index property
       when mbean=xxx is set, the jmxpath is the attribute of the mbean
example: !jmx h=prod mbean='java.lang:type=Threading' 'ThreadCount' 'PeakThreadCount'
         !jmx h=192.168.1.1 proto=mp mbean='java.lang:type=Threading' 'ThreadCount' 'PeakThreadCount'
         !jmx func=get h=192.168.1.1 proto=rmi mode=batch mbean='java.lang:type=Threading' 'ThreadCount' 'PeakThreadCount'
         !jmx h=prod 'java.lang:type=Threading:ThreadCount' 'java.lang:type=Memory:HeapMemoryUsage.used'
```

### !mongo
execute a mongo query
```
Usage: !mongo [h=xxx [port=xxxx] ] [user=xxx [pass=yyy] ] [db=test [coll=ccc] ] [query]
example: !mongo h=124.111.5.132 username=foo password=bar dbname=test {serverStatus:1}
```

### !cim
execute a cim query against the given host and print the result
```
Usage: !cim [username=xxx [password=yyy]] [timeout=xxx] [namespace=CIMV2] h=<host> [port=5989] [ssl=false] c=<class> [query]
If you don't give the username/password, the agent will use cim.user/cim.pass properties of the host.
example: !cim namespace=emc/celerra h=paz02sql002 p=5989 ssl=true c=CIM_ComputerSystem select * from CIM_ComputerSystem
```

### !esx
execute esx query for the given host
```
Usage: !esx [username=foo password=bar] [url=https://host/sdk] <host> <entityName> <entityType[host|vm|datastore|datastoreperf|cluster|resourcepool|hoststatus|cpu|memory|disk|vdisk|network|storagepath]> [counter1 [counter2...]]
If you don't give the username/password, the agent will use esx.user/esx.pass properties of the host.
example: !esx username=XXXX password=YYYY 10.10.10.10 * datastore
         !esx username=XXXX password=YYYY 10.10.10.10 "datastore1" datastore disk.used.latest
```

### !netapp
call netapp api for the given host
```
Usage: !netapp [username=xxxx [password=yyyy]] [ssl=true|false] [cluster=true|false] [port=port#] <host> <netapp cmd> <arguments and options to netapp command>.
Supported netapp commands: perf-object-list-info, perf-object-instance-list-info <object>, perf-object-get-instances <objecttype> <instancename>
example: !netapp paznetapp001 perf-object-list-info
         !netapp cluster=true paznetapp002 perf-instance-list-info acp
```

### !xen
query a xen server counter against the given host
```
Usage: !xen: query a xen server counter against the given host
!xen [username=xxxx] [password=yyy] [xen.pool=true|false] host entityNameOrUuid entityType[host|cpu|pif|vm|vbd|vif|sr|pool] [counter [counter ...]]
If you don't supply username/password, the collector will use the host properties xen.user/xen.pass
example: !xen 10.0.0.50 e88d16e8-c4df-ce14-8f06-cfd3bf831f95 vm memory_actual
```

---

## Discovery & AutoProps

Directly relevant to debugging PropertySource and discovery scripts: inspect and re-run AutoDiscovery (device/instance discovery) and AutoProps (property-collection) tasks, and manage host system properties.

### !adlist
list AutoDiscovery tasks
```
Usage: !adlist [type=ad|get] [h=xxx] [ds=xxx] [pid=nnn] [method=foo] [status=WAITING/EXECUTING/DONE/FAILED/EMPTY]
example: !adlist type=get
example: !adlist type=ad h=paz* ds=WinLogicDisk-
example: !adlist method=ad_snmp
```

### !adetail
show detail info of an AutoDiscovery task
```
Usage: !adetail: show detail info of a getDiscoveryFeed task or discovery task
Usage: !adetail [showReportStatus=false] <taskid> | <parent task id> (the pid in !adlist)
example: !adetail 43434334
```

### !aplist
list AutoProps tasks
```
Usage: !aplist [type=ap|get] [h=xxx] [pid=nnn] [method=foo] [status=failed/done/waiting/executing/duplicate/unknown/]
example: !aplist type=get
example: !aplist type=ap h=paz*-
```

### !apdetail
show detail info of an AutoProps task
```
Usage: !apdetail: show detail information of an auto props task.
Usage: !apdetail <taskid> | <parent id> (the pid in !aplist)
example: !apdetail 12345467890
```

### !hostproperty
add, update or delete system property for the given host
```
Usage: !HostProperty: Add, update or delete system property of host.
Note - This operation is not allowed on - ips.
WARNING: This debug command will report the result to santaba immediately
Usage: !HostProperty action=add|del host=hostname property=system-property [value=property-value]
       action:   add is used to add or update system property
       host:     the system.hostname property of monitored device
       property: the system property without "system." prefix
       value:    the new property value
Example: !HostProperty action=del host=localhost property=virtualization
              delete system.virtualization from localhost
```

### !splist
list latest script property tasks in collector
```
Usage: !splist [ruleId=XXX] [hostname=XXX] or !splist [name=XXXX]
```

### !spdetail
show detailed info for specified script task
```
Usage: !spdetail (uniqueId)
```

---

## Diagnostic Sources

### !dxlist
Get the list of diagnostic source tasks
```
Usage: !dxlist or !dxlist [id=XXX] or !dxlist [name=XXXX] or
!dxlist [hostname=XXX] or !dxlist [id=XXX] [hostname=XXX] or
!dxlist [name=XXX] [hostname=XXX]
example1: !dxlist
example2: !dxlist id=34255
example3: !dxlist name=dsName34Test
example4: !dxlist hostname=127.0.0.1_TestDevice
example5: !dxlist id=34255 hostname=127.0.0.1_TestDevice
example6: !dxlist name=dsName34Test hostname=127.0.0.1_TestDevice
```

### !dxdetail
Get the details of a diagnostic source task
```
Usage: !dxdetail (uniqueId)
```

---

## TopologySource

### !tplist
list topology tasks
```
Usage: !tplist [h=xxx] [ts=xxx] [status=WAITING/EXECUTING/DONE/FAILED/EMPTY]
example: !tplist
example: !tplist h=paz* ts=WinLogicDisk-
```

### !tpdetail
show the detail information of topology tasks
```
Usage: !tpdetail: show detail info of a topology task
Usage: !tpdetail [showReportStatus=false] <taskid>
example: !tpdetail 43434334
```

---

## Collection Task Introspection

General datasource/configsource/eventsource/logsource collection task state — not specific to any one module type.

### !tlist
list a set of collecting tasks include datasource, configsource and eventsource
```
Usage: !tlist [type=xxx] [h=xxx] [dsi=xxx] [es=xxx] [c=xxx] [status=NaN|SCHEDULING|WAITING|EXECUTING|INVALID] [hostactive=true|false] [summary=true|false|collector|host|datasource [lasttime=minutes columns=5]]
Where:
  type    = source type: ds/data (datasource), cs/config (configsource), es/event (eventsource), ls/logsource (logsource), default: datasource and eventsource
  h       = hostname (supports glob or regex)
  dsi     = datasource instance name (supports glob or regex)
  es      = eventsource name
  c       = collector name
  ls      = logsource name
  status  = task status filter
  hostactive = true|false|unset - if true, shows only data that would keep the host alive
  summary = false|true|collector|host|datasource
  lasttime = time window in minutes (max: 30)
  columns  = number of columns in historical map (default: 5, max: 10)
Examples:
  !tlist type=data c=wmi h=paz02sql* dsi=WinLogicDisk-*
  !tlist type=data c=wmi h=paz02sql* dsi=WinLogicDisk-* summary=true
  !tlist type=ls summary=true
  !tlist summary=true lasttime=10 columns=5
  !tlist summary=collector
  !tlist summary=host
  !tlist hostactive=true
```

### !tdetail
list detail of a task, taskid refer the output of !tlist command
```
Usage: !tdetail <TASKID>
example: !tdetail 12323209239991
```

### !tcancel
disable to execute collecting task
```
Usage: !tcancel <taskId>
```

### !tremove
disable to execute collecting task
```
Usage: !tcancel <taskId>
```
(Note: `help !tremove` returns the same text as `help !tcancel` verbatim — this is what the collector returns, not a transcription error.)

### !slist
list detail of a task, taskid refer the output of !tlist command
```
Usage: !slist type=TypeX service=ServiceX status=StatusX
```

### !sdetail
list the execution of internal website execution
```
Usage: !sdetail taskId
```

### !nsplist
show all net scanning tasks
```
Usage: !nsplist
```

### !nspdetail
show detail info of a net scanning task
```
Usage: !nspdetail [verbose=false|true] <taskid>
example1: !nspdetail 1342342134
example2: !nspdetail verbose=true 1342342134
```

---

## SNMP

### !snmpget
get the values of a list of OIDs from the given host
```
usage: !snmpget [OPTIONS]  <host> <oid1> <oid2> ...
OPTIONS:
  version=VERSION               set snmp version to use(v1|v2c|v3)
  port = PORT                   set the snmp port (e.g. 161)
  useSystem=false               use system command instead of the collector one, 64-bit only
SNMP v1/v2c: community=COMMUNITY
SNMP v3: auth=PROTOCOL (MD5|SHA|SHA224|SHA256|SHA384|SHA512), authToken=PASSPHRASE, security=USER-NAME,
         priv=PROTOCOL (DES|AES|3DES|AES128|AES192|AES256|...), privToken=PASSPHRASE,
         contextEngineId=ENGINE-ID, contextName=CONTEXT
General: timeout=TIMEOUT, mode=MODE (batch|oneByOne)
If you don't specify community and/or version, the agent will use snmp.community/snmp.version properties of that host.
example1: !snmpget paz02sql003 .1.2.3.4.5.5
example2: !snmpget version=v3 auth=MD5 authToken=xxxx security=xxxx localhost .1.2.3.4.5.5
```

### !snmpwalk
walk the oid from the given host
```
Usage: !snmpwalk [OPTIONS] <host> <OID>
OPTIONS:
  version = VERSION             specifies SNMP version to use(v1|v2c|v3)
  port = PORT                   set the snmp port (e.g. 161)
  usegetnext=false              use getnext pdu to do snmpwalk?
  useSystem=false               use system command instead of the collector one, 64-bit only
SNMP v1/v2c: community=COMMUNITY
SNMP v3: auth/authToken/security/priv/privToken/contextEngineId/contextName (same as !snmpget)
General: timeout=TIMEOUT (whole walk), pdutimeout=PDU TIMEOUT (per-pdu, walk may span multiple pdus)
example1: !snmpwalk paz02sql003 .1.2.3.4.5.5
example2: !snmpwalk version=v3 auth=MD5 authToken=xxxx security=xxxx timeout=4 localhost .1.2.3
```

### !snmpdiagnose
diagnose snmp oid for given host
```
!snmpDiagnose [OPTIONS] host [oid [oid] ...]
OPTIONS:
  version=v1|v2c|v3, community=public (default)
  auth=MD5|SHA|SHA224|SHA256|SHA384|SHA512, authToken, contextName, security
  priv=DES|AES|AES128|AES192|AES256|3DES|DESEDE|AES1923DES|AES2563DES|AES192C|AES256C
  snmpEngineId, contextEngineId, localEngineId
  retries=int (default 1), timeout=int seconds (default 5), maxSizeResponse=int (default 65535)
  pduType=GET|WALK, srcPort=int (default 0), port=int (default 161), reqId=int
  transport=udp|tcp (default udp), taskTimeout=int seconds (default 120)
```

### !snmptrap
diagnose snmptrap event source
```
Usage: !snmptrap <h=hostname> <es=event-source-name> [timeout=120] [maxCount=1]
       h  - the host name. if the id is not set, it's required.
       es - the event source name. if the id is not set, it's required.
       id - the event source task id, from the !tlist output. required if either h or es aren't set.
       timeout - the snmptrap task will be finished in timeout seconds (default 2 minutes if maxCount unset, max 10 minutes)
       maxCount - the task will finish after receiving this many messages
Examples:
       !snmptrap h=192.168.76.1 es=snmptrap-test timeout=300
       !snmptrap h=192.168.76.1 es=snmptrap-test maxCount=5
       !snmptrap id=-120 timeout=200 maxCount=3
```

---

## Networking & Diagnostics

### !ping
ping a given host
```
Usage: !ping [type=default|all|proxy|sys|java] [count=10] <host>
       count: the number of send packages, optional
       host: the host to ping
       type: the ping implementation type, optional
               default - decided by conf pingpool.usejava (java ping if true, else proxy ping)
               all     - run all types of ping to help compare results
               proxy   - use sbproxy to do ping requests
               sys     - use system ping command
               java    - use java ping
example: !ping www.google.com
```

### !nslookup
resolve IP of the given host
```
Usage: !nslookup host1 [host2 ...]
example: !nslookup www.google.com
```

### !checkserverconnectivity
check the santaba server connectivity
```
Usage: !checkServerConnectivity: check connectivity of a new santaba server <host>, includes DNS, PING, TCP & HTTP
example: !checkServerConnectivity demo.logicmonitor.com
```

### !macaddress
get the mac address for the given host
```
Usage: !macaddress ip1 ip2 : try to get the mac address for remote address
Examples: !macaddress 192.168.170.111
          !macaddress fe80::250:56ff:feab:5000
```

### !ipaddress
show the agent ip config
```
Usage: !ipaddress
```

### !jssl
get ssl info for the given host
```
Usage: !jssl func=XXX [protocol=XXX] [cipher=YYYY] [showCert=ZZZZ] hostname [port]
Func: sniffer | handshake | cliInfo (must specify one)
  sniffer  : sniffer which ciphers are supported by the server (protocol=XXX limits protocols)
             eg: !jssl func=sniffer protocol=TLSv1.2,TLSv1.1 www.baidu.com 443
  handshake: do handshaking with given server with specified protocol and cipher
             eg: !jssl showCert=true func=handshake protocol=TLSv1.2 cipher=TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 www.baidu.com
  cliInfo  : enumerate the supported protocols/ciphers in client, eg: !jssl func=cliInfo
```

### !sslcerts
print ssl certificate info for the given host
```
Usage: !sslcerts [timeout=XX] [verbose=false] host port
Notice: options must be placed before arguments.
Parameters: host (which host to get ssl certs), port (which port)
Options: timeout (connection timeout seconds, default 10), verbose (show cert details, default false)
Examples: !sslcerts timeout=5 verbose=true www.google.com 443
```

### !ssltest
test ssl connection status
```
Usage: !ssltest [opts] host[:port]
-sslprotocol                 Sets the SSL/TLS protocol to be used (e.g. SSL, TLS, SSLv3, TLSv1.2, etc.)
-enabledprotocols protocols  Sets individual SSL/TLS protocols that should be enabled
-ciphers cipherspec          A comma-separated list of SSL/TLS ciphers
-truststore/-truststoretype/-truststorepassword/-truststorealgorithm/-truststoreprovider
-no-check-certificate        Ignores certificate errors
-no-verify-hostname          Ignores hostname mismatches
-unlimited-jce                Enable unlimited JCE
-sni                          Enable SNI check
-h -help --help                Shows this help message
```

### !packetcapture
make a packet capture task by using tcpdump (in linux) or netsh (in windows)
```
Usage: !packetcapture [interface=YourInterface] [protocol=tcp|udp|icmp] [timeout=timeoutInMinutes] [port=YourPort] start YourHost YourCapFile
Examples:
	!packetcapture interface=eth0 protocol=icmp timeout=1 start 10.10.10.10 ping.cap
	!packetcapture interface=eth0 protocol=udp port=161 timeout=1 start 10.10.10.10 snmp.cap
	!packetcapture interface=eth0 protocol=tcp port=443 timeout=1 start 10.10.10.10 http.cap
```

### !packetcapture2
use npcap (windows) or libpcap (linux) to do packet capture
```
Usage: !packetcapture2 interface=deviceName [timeout=timeoutInMinutes] file=YourCapFile filterXXX
	interface is the interface name
	filterXXX is the capture filter expression
Examples: !packetcapture2 interface=eth0 file=test.pcap timeout=1 "tcp and host 10.10.10.10 and port 443"
```

### !netflow
get netflow information
```
Usage:
	!netflow func=listDevices
	!netflow func=query select * from INFORMATION_SCHEMA.SYSTEM_TABLES where table_type='TABLE' and TABLE_NAME LIKE '%RAW%'
	!netflow func=query select * from <tableName>
	!netflow func=update insert into <tableName> values(xxx)
	!netflow func=diagnose <deviceId> [timezone]
	!netflow func=dump <deviceId>
	!netflow func=debug log no|all|error
	!netflow func=parse <deviceId> <netflow|sflow> <raw package>
	!netflow func=print <deviceId> <netflow srcId> <netflow9 templateId>
	!netflow func=getWaitAggregateTables | getActiveTables | getDataSize | getLast10CPInfo
	!netflow func=setExecCheckpointTimeIntervalInSec | setExecCheckpointDataSize | getExecCheckpointInfo
	!netflow func=getFlowMetrics | getInserterQueueDrops | getNetflowGroupDetails
```

### !syslog
test if syslog event source works as expected
```
Usage: !syslog <h=hostname> <es=event-source-name> [timeout=120] [maxCount=1]
       h/es/id required as in !snmptrap; timeout default 2 minutes (max 10), maxCount finishes early on N messages
Examples: !syslog h=192.168.76.1 es=syslog-test timeout=300
          !syslog h=192.168.76.1 es=syslog-test maxCount=5
          !syslog id=-120 timeout=200 maxCount=3
```

### !syslogsender
send a syslog message to the given host
```
Usage: !syslogsender <host> <port> <message>
```

### !logfile
diagnose logfile event source
```
Usage: !logfile [h=hostname es=event-source] [id=event-source-task-id] fileIndex=0 startLine=1 [maxLines=100] [encoding=Default|Autodetect|UTF-8|UTF-16]
       h - hostname (required if id not set), es - event source name (required if id not set)
       id - event source task id from !tlist output (required if h or es not set)
       fileIndex - log file index (required if multiple monitored files)
       startLine - read starting at this line (required)
       maxLines - read this many lines
       encoding - file content encoding
Examples: !logfile h=ERIC-PC es=LogFile-Test startLine=1000 maxLines=50
          !logfile id=-23 startLine=100 maxLines=10
          !logfile id=-21 fileIndex=1 startLine=10000
```

### !logsearch
search log based on rules
```
Usage: !logsearch [max-detail=N] [max-log-record=N] [rule-file=<file-path>] [logs-directory]
	max-detail: max count to print per matched event (default 0 = don't print detail)
	max-log-record: max count of matched log saved per rule (default 1000)
	rule-file: rule file (default embedded)
	logs-directory: logs directory (default $AGENTROOT/logs)
```

### !webperf
send a HTTP request and print metrics
```
Usage: !webperf <url>
```

---

## File & Log Operations

### !dir
list files under folder
```
(Falls through to the underlying BusyBox `ls` help text, not a custom LM usage string.)
BusyBox v1.37.0 multi-call binary.
Usage: ls [-1AaCxdLHRFplinshrSXvctu] [-w WIDTH] [FILE]...
List directory contents
	-1 One column, -a/-A include dotfiles, -d dirs not contents, -L/-H follow symlinks, -R recurse,
	-p append /, -F append indicator, -l long format, -i inode numbers, -n numeric UID/GID,
	-s allocated blocks, -h human sizes, --group-directories-first, -S/-X/-v/-t sort variants,
	-r reverse, -w N columns wide, --color[={always,never,auto}]
```

### !cp
copy file in `<agentRoot>` directory
```
Usage: !cp [overwrite=true] sourceFile destFile
```

### !put
copy a file under server $company/scripts to `<agentRoot>/tmp`
```
Usage: !put [overwrite=false|true] <file>
example: !put overwrite=true abc.vbs
(copies <company>/script/abc.vbs to <agentroot>/tmp, overwriting if it exists and overwrite=true)
```

### !replace
copy `<agentRoot>/tmp/<source>` to `<agentRoot>/<dest>`
```
Usage: !replace [overwrite=true|false] <source> <dest>
```

### !digest
calculate File Checksum MD5/SHA1/SHA-256, default is MD5
```
usage: !digest [<alg=md5|sha1|sha256>] <filepath>
example1: !digest ../lib/logicmonitor-common.jar    -- calculate MD5
example2: !digest alg=SHA1 ../lib/logicmonitor-common.jar   -- calculate SHA1
example3: !digest alg=SHA256 ../lib/logicmonitor-common.jar   -- calculate SHA-256
```

### !tail
tail the given file with regex
```
Usage: !tail <filename> [<n> [<regex>]]
example1: !tail ../logs/wrapper.log    -- show last 20 lines
example2: !tail ../logs/wrapper.log 30 -- show last 30 lines
example3: !tail ../logs/wrapper.log 30 snmp -- show lines (of the last 30) containing "snmp"
```

### !logsurf
surf the log file
```
Usage: !logsurf level=all|trace|debug|info|warn|error seq=xxx taskId=xxx n=xxx <filename list>
example: !logsurf level=trace n=50 wrapper.log sbproxy.log
```

### !uploadlog
upload specified log files
```
Usage: !uploadlog <logfile1> <logfile2> ...
example1: !uploadlog wrapper.log                   - upload wrapper.log
example2: !uploadlog wrapper.log sbproxy.log       - upload wrapper.log and sbproxy.log
```

### !unzip
unzip the given zipped file
```
Usage: !unzip zippedFile [targetDir]
zippedFile: relative path to the zipped file, base dir is SBAGENTROOT
targetDir : relative path to destination directory (default: parent directory of zipped file)
Notice: windows - should not contain '..' or ':\', should not start with '\'
        linux   - should not contain '..', should not start with '/'
Examples: !unzip logs/wrapper.log.zip
          !unzip logs/wrapper.log.zip test/
```

---

## Collector Management & Diagnostics

### !restart
restart collector or watchdog
```
Usage: !restart [collector|watchdog]. If not set, restart collector
```

### !reload
force reloading agent configuration from server
```
Usage: !reload
```

### !register
update collector description
```
Usage: !register [force=true|false]. If the collector has registered, please set force=true
```

### !getconfig
get collector configuration item value
```
Usage: !getconfig configKey.
For example, to get value of java ping pool, execute: !getconfig pingpool.usejava
```

### !reducelog
enable or disable the reduce logger
```
Usage: 
    !reducelog func=[disable|enable|status] [options]
func:
    status : show status of reduce logger
    disable: disable reduce logger
    enable : enable reduce logger. Use options to change the configurations
[options]:
    threshold: default 5. Log will be aggregated if same log exceeds the threshold in the interval
    count    : default 5. count of logs kept in memory per interval (excludes logs not exceeding threshold)
    expire   : in seconds. log item removed if not logged again after expiry time
    interval : in seconds, default 60
    persist  : default false. Should the change be persisted
(Note: only 'persist' works for both enable and disable; the others only apply to enable.)
```

### !loglevel
change the log level of an agent component
```
Usage:
1. !loglevel func=list (list all log components)
2. !loglevel func=set [component=foo] [level=bar] [persistent=true|false|none]
3. !loglevel func=set [task=123112] [level=debug] [persistent=true|false|none]
4. !loglevel func=show (show all loglevels set by this command)
5. !loglevel func=clear (clear all loglevels set by !loglevel, persisted or not)
(default value for persistent is none, meaning not updating the persistent file.)
```

### !log4jloglevel
change the log level of log4j component
```
Usage:
	!log4jloglevel func= set|query component=comp1,...compn [level=level]
Func: set (set loglevel of given components), query (query loglevel of given components)
Level: all trace debug info warn fatal off
Common components: org.snmp4j, org.snmp4j.mp.MPv3, org.apache.http.impl.client,
                    org.apache.http.headers, org.apache.http.wire (produces huge log)
```

### !keepagentalive
keep agent alive in given period
```
Usage:
  !keepAgentAlive recipient=watchdog [periodInMin]: keep agent alive in given period (0-60 minutes)
  !keepAgentAlive recipient=watchdog clear : clear the time for keeping the agent alive
  !keepAgentAlive recipient=watchdog status : query the time for keeping the agent alive
Notice: this command can only run in watchdog, so 'recipient=watchdog' is required.
```

### !dumpheap
dump collector jvm heap info
```
Usage: !dumpheap: dump collector jvm heap
Usage: !dumpheap [live=true]
```

### !perf
Get the Collector performance analysis
```
Usage: !perf [type=xxx] [dsFilterColumn=xxx] [ds=xxx] [h=xxx]
type: 'ds' (datasource), 'cpu', or 'queue'
dsFilterColumn: 'nan', 'timeout', 'queue', 'dropped', 'avg_exec' (filters the datasource table)
ds/h: glob or regex, applicable only to the datasource table
example1: !perf type=cpu
example2: !perf type=queue
example3: !perf type=ds dsFilterColumn=timeout
example4: !perf type=ds dsFilterColumn=timeout ds=*DS_TIMEOUT
example5: !perf type=ds dsFilterColumn=timeout ds=*DS_TIMEOUT h=127.0.0.1
```

### !reportercache
show status of BufferDataReporter
```
Usage: !reportercache status : show status of BufferDataReporter
```

### !upgradeproxy
upgrade sbwinproxy or sblinuxproxy from `<agentroot>/tmp`
```
Usage: !upgradeproxy
```

### !svc
execute service management command on agent's hosting machine
```
(Falls through to `rc-service --help`.)
Usage: rc-service [options] [-i] <service> <cmd>...
   or: rc-service [options] -e <service>
   or: rc-service [options] -l
   or: rc-service [options] -r <service>
Options: -d/--debug, -D/--nodeps, -e/--exists, -c/--ifcrashed, -i/--ifexists, -I/--ifinactive,
         -N/--ifnotstarted, -s/--ifstarted, -S/--ifstopped, -l/--list, -r/--resolve,
         -Z/--dry-run, -h/--help, -C/--nocolor, -V/--version, -v/--verbose, -q/--quiet, -U/--user
```

### !tasklist
list process on agent's hosting machine
```
(Falls through to `ps --help`.)
Usage: ps [options]
Try 'ps --help <simple|list|output|threads|misc|all>' or 'ps --help <s|l|o|t|m|a>' for additional help.
See ps(1) for more details.
```

### !uptime
shows the agent uptime
```
Usage: !uptime
```

### !firewallstatus
show firewall settings
```
(On this collector's host, iptables is not present, so help falls through to an OS-level error rather than a custom LM usage string:)
Cannot execute help command iptables --help, error=Cannot run program "iptables": Exec failed, error: 2 (No such file or directory)
```

### !avslist
list all installed anti-virus software in system
```
usage: !avslist [h=host] [username=foo password=bar] [timeout=60]
       If you don't give the username/password, the agent will use wmi.user/wmi.pass properties of the host.
       For linux this will work on collector version 36100 or above.
example: !avslist
```

### !checkcredential
check the credential usages
```
Usage: !CheckCredential check the credential usages
!CheckCredential [runner=sse|agent|*] [host=hostname] enable
    Enable to check credential - the collector saves username/password length if auto discover/collect/AP fails for that host.
!CheckCredential [runner=sse|agent|*] [host=hostname] disable
    Disable to check credential and erase all saved data for that host.
!CheckCredential [runner=sse|agent|*] [host=hostname] [proto=protocol] [user=username] [usage=usage] [source=sourcename] [showAllHistory=true|false]
    Get credential usages.
    host  = hostname, "*" for all hosts monitored by this collector (supports glob)
    proto = WMI | Perfmon | SNMP | JDBC | JMX | CIM | NetApp | ESX | Xen | HTTP | SSH (SNMP can be SNMP.v1/v2c/v3; HTTP includes CIM/ESX/Xen)
    user  = username (or "" for snmp v1/v2c)
    runner = sse|agent|* (default *)
    usage  = AD | AP | NetScan | PropertySource | DataSource | EventSource | ConfigSource | Debug
    source = AP | netscan policy name | property source name | datasource name | eventsource name | configsource name | debug command name
Examples: !CheckCredential proto=snmp user=logicmonitor
          !CheckCredential proto=snmp user=logicmonitor usage=AP
```

### !logingestion
display info about Queue, Filter, Syslog API status, Ingest API communication status, etc.
```
Usage: !logingestion <type=syslog> <entity=queue/filter/syslogapi/ingestapi/filterLS/ingestapiLS>
       type   - the log type, default is syslog
       entity - queue, filter, syslogapi, ingestapi, filterLS, or ingestapiLS
Examples:
       !logingestion type=syslog entity=queue
       !logingestion type=syslog entity=filter msg="syslog_msg"
       !logingestion type=syslog entity=filter msg="syslog_msg" customFilter="logsource.syslog.filter.1.message.contain=attack,logsource.syslog.filter.2.severity.equal=error"
       !logingestion type=syslog entity=syslogapi
       !logingestion type=syslog entity=ingestapi msg="syslog_msg"
       !logingestion type=syslog entity=filterLS msg="syslog_msg" logsourceName="logsourceName"
```

---

## Debug-Session Meta

Commands for inspecting previously-run debug commands themselves.

### !debughistory
get the history of debug command executed
```
Usage: !debughistory
example: !debughistory
```

### !debugdetail
get the output of a debug command
```
Usage: !debugdetail [commandId]
        commandId: get the command id from !debughistory
example: !debugdetail 3
```

---

## Misc

### !sconfig
set or get the internal website configs
```
Usage: !config set|get [args ...]
```

### !DecryptFileSHA
To get the Decrypted SHA of specific file. If filename not mentioned, SHA of all files in JSON format is displayed
```
!DecryptFileSHA *fileName*
```

---

## Related tools

- **`execute_debug_command`** — run any of the commands above (as `cmdline`, e.g. `"help !ping"` or the real invocation) against a `collectorId`.
- **`get_debug_command_result`** — poll for output using the `sessionId`/`cmdContext` returned by `execute_debug_command`, when a command doesn't return its output synchronously.
- **`list_collectors`** / **`get_collector`** — find a valid `collectorId` to target.
- **`get_resource`** / **`list_resources`** — find a `hostId` or hostname to embed inside a `cmdline` (e.g. `!groovy hostId=6412 ...`, `!ping <host>`).
