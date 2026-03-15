import sqlite3
p='C:/Users/JeremiahVanWagner/.openclaw/memory/main.sqlite'
conn=sqlite3.connect(p)
cur=conn.cursor()
for t in ['files','chunks','embedding_cache','chunks_vec_rowids','chunks_vec']:
    print('\n==',t)
    cur.execute(f"PRAGMA table_info({t})")
    for r in cur.fetchall():
        print(r)
conn.close()
