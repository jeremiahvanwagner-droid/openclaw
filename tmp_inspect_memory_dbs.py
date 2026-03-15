import sqlite3,glob,os
paths=glob.glob('C:/Users/JeremiahVanWagner/.openclaw/memory/*.sqlite')
for p in paths:
    conn=sqlite3.connect(p)
    cur=conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables=[r[0] for r in cur.fetchall()]
    print(os.path.basename(p), tables)
    conn.close()
