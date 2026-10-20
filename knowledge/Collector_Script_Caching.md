# Collector Script Caching

This feature is available for Collector versions 29.100 or higher.

## Overview

Collector scripts require authentication tokens to communicate with certain entities. In older versions of the Collector, these Auth tokens are stored in files, which means that read and write operations are done in every LogicModule that needs to access the files. Collector versions 29.100 or higher allow you to store these Auth tokens in a cache between collection intervals until the token expires.

## Using ScriptCache

The `ScriptCache` class contains the following methods:

|Method|Description|
|---|---|
|`ScriptCache.getCache();`|To get the cache object to perform further operations. Returns ScriptCache object.|
|`ScriptCache.set(String key, String value, &lsqb;optional&rsqb; long expireIn);`|Set the key, value, and (optional) expireIn. If set, expireIn value is in milliseconds. Example: 3000.|
|`ScriptCache.get(String key);`|Get a cache entry by key name|
|`ScriptCache.remove(String key);`|Remove a cache entry by key name|

The `expireIn` value is optional and can be set for each key that is stored in the cache. If the value is not set for a particular key, the default expire timeout will be the value set in the `collector.script.cache.timeout` in `agent.conf`. For example:

`collector.script.cache.timeout=30 //30 minutes`

New scripts with `ScriptCache` won’t work with older versions of the Collector. Importing `ScriptCache` will throw an exception in older collectors. The following script example will work in all Collectors:

```groovy
def scriptCache
try {
    scriptCache = this.class.classLoader.loadClass("com.santaba.agent.util.script.ScriptCache").getCache();
    //new way
    String token = scriptCache.get("token1");
    if(token == null){
         //make connection, fetch new token and store it in cache
         scriptCache.set("token1", "asfioajfiqu920200rdaoj9au");
    } else{
         //make connection
    }
} catch (Exception ex) {
    //old way
}
```

In this script, if the import statement fails for the ScriptCache class, it will default to the old way of saving tokens with files. If it passes, it will use ScriptCache.
