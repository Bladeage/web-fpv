import re, sys
def conv(src):
    out=[]; pos=0
    for m in re.finditer(r'(<script\b[^>]*>)(.*?)(</script>)', src, re.S):
        out.append(html_part(src[pos:m.start(2)])); out.append(js_part(m.group(2))); pos=m.end(2)
    out.append(html_part(src[pos:]))
    s=''.join(out)
    assert all(ord(c)<128 for c in s); assert '<%' not in s
    return s
def html_part(t): return ''.join(c if ord(c)<128 else '&#x%X;'%ord(c) for c in t)
def js_part(t):   return ''.join(c if ord(c)<128 else '\\u%04X'%ord(c) for c in t)
src,dst=sys.argv[1],sys.argv[2]
open(dst,'w',encoding='ascii',newline='\r\n').write(conv(open(src,encoding='utf-8').read()))
print(dst,'ok')
