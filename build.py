# 公開ページ(claude.ai)用の1ファイル版を作る: python3 build.py
import re
s=open('index.html',encoding='utf-8').read()
body=re.search(r'<body>(.*)</body>',s,re.S).group(1)
style=re.search(r'(<link rel="stylesheet".*?</style>)',s,re.S).group(1)
parse=open('parse.js',encoding='utf-8').read()
body=body.replace('<script src="parse.js"></script>','<script>\n'+parse+'\n</script>')
open('dist-artifact.html','w',encoding='utf-8').write('<title>アルファ受注ナビ</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n'+style+'\n'+body)
