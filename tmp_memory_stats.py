import sqlite3,glob,os,datetime
cutoff_dt=datetime.datetime(2025,12,15,10,44,0,tzinfo=datetime.timezone.utc)
cutoff_ms=int(cutoff_dt.timestamp()*1000)
for p in glob.glob('C:/Users/JeremiahVanWagner/.openclaw/memory/*.sqlite'):
    conn=sqlite3.connect(p)
    cur=conn.cursor()
    cur.execute('select count(*), min(updated_at), max(updated_at) from chunks')
    cnt,minu,maxu=cur.fetchone()
    cur.execute('select count(*) from chunks where updated_at < ?', (cutoff_ms,))
    old=cur.fetchone()[0]
    cur.execute('select count(*) from files')
    fcnt=cur.fetchone()[0]
    cur.execute('select count(*) from embedding_cache')
    ec=cur.fetchone()[0]
    print(os.path.basename(p), 'chunks',cnt,'old',old,'min',minu,'max',maxu,'files',fcnt,'emb',ec)
    conn.close()
