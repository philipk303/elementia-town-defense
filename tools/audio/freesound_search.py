import os, sys, json, urllib.parse, urllib.request

TOKEN = os.environ["FREESOUND_API_KEY"]
FIELDS = "id,name,description,tags,license,duration,download,previews,username,url"

def search(query, filter_str=None, sort="rating_desc", page_size=10):
    params = {
        "query": query,
        "token": TOKEN,
        "fields": FIELDS,
        "page_size": page_size,
        "sort": sort,
    }
    if filter_str:
        params["filter"] = filter_str
    url = "https://freesound.org/apiv2/search/text/?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url) as r:
        return json.load(r)

if __name__ == "__main__":
    query = sys.argv[1]
    filter_str = sys.argv[2] if len(sys.argv) > 2 else 'license:("Creative Commons 0" OR "Attribution")'
    data = search(query, filter_str)
    print(f"query={query!r} count={data.get('count')}")
    for r in data.get("results", []):
        print(f"- id={r['id']} dur={r['duration']:.2f}s lic={r['license']} '{r['name']}' by {r['username']}")
        print(f"  tags: {', '.join(r['tags'][:8])}")
        print(f"  desc: {r['description'][:120]}")
        print(f"  url: {r['url']}")
