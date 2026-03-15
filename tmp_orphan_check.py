import sqlite3,glob,os
for p in glob.glob('C:/Users/JeremiahVanWagner/.openclaw/memory/*.sqlite'):
    conn=sqlite3.connect(p)
    cur=conn.cursor()
    cur.execute("select count(*) from embedding_cache ec where not exists (select 1 from chunks c where c.hash=ec.hash)")
    emb_orphans=cur.fetchone()[0]
    cur.execute("select count(*) from chunks_vec_rowids vr where not exists (select 1 from chunks c where c.id=vr.id)")
    vec_orphans=cur.fetchone()[0]
    cur.execute("select count(*) from chunks c where not exists (select 1 from files f where f.path=c.path and f.source=c.source)")
    chunk_orphans=cur.fetchone()[0]
    print(os.path.basename(p), 'emb_orphans',emb_orphans,'vec_orphans',vec_orphans,'chunk_orphans',chunk_orphans)
    conn.close()
