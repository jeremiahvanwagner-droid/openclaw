import sqlite3,glob,os,json,datetime,traceback

ROOT='C:/Users/JeremiahVanWagner/.openclaw'
DB_GLOB=f'{ROOT}/memory/*.sqlite'
ARCHIVE_DIR=f'{ROOT}/backups/agent-memory-archive'
os.makedirs(ARCHIVE_DIR, exist_ok=True)

now_utc=datetime.datetime(2026,3,15,10,44,0,tzinfo=datetime.timezone.utc)
cutoff=now_utc-datetime.timedelta(days=90)
cutoff_ms=int(cutoff.timestamp()*1000)

summary={
  'run_utc': now_utc.isoformat(),
  'cutoff_utc': cutoff.isoformat(),
  'databases': [],
  'totals': {'archived':0,'orphan_embeddings_pruned':0,'storage_reclaimed_bytes':0},
  'errors': []
}

for db in glob.glob(DB_GLOB):
  name=os.path.basename(db)
  entry={'db':name,'archived':0,'orphan_embeddings_pruned':0,'size_before':None,'size_after':None,'reclaimed_bytes':0,'error':None}
  try:
    size_before=os.path.getsize(db)
    entry['size_before']=size_before

    conn=sqlite3.connect(db)
    cur=conn.cursor()

    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables={r[0] for r in cur.fetchall()}

    archived_rows=[]
    if 'chunks' in tables:
      cur.execute("SELECT id,path,source,start_line,end_line,hash,model,text,updated_at FROM chunks WHERE updated_at < ?", (cutoff_ms,))
      archived_rows=cur.fetchall()

      if archived_rows:
        ts=now_utc.strftime('%Y%m%dT%H%M%SZ')
        archive_path=f"{ARCHIVE_DIR}/{name}.{ts}.jsonl"
        with open(archive_path,'a',encoding='utf-8') as f:
          for r in archived_rows:
            rec={
              'db':name,
              'archived_at_utc':now_utc.isoformat(),
              'id':r[0],'path':r[1],'source':r[2],'start_line':r[3],'end_line':r[4],
              'hash':r[5],'model':r[6],'text':r[7],'updated_at':r[8]
            }
            f.write(json.dumps(rec,ensure_ascii=False)+'\\n')

        ids=[r[0] for r in archived_rows]
        # delete old chunks and any dangling vec rowids after delete
        cur.executemany("DELETE FROM chunks WHERE id = ?", [(i,) for i in ids])

    # prune orphan embeddings (hash not referenced by any chunk)
    pruned=0
    if 'embedding_cache' in tables and 'chunks' in tables:
      cur.execute("SELECT COUNT(*) FROM embedding_cache ec WHERE NOT EXISTS (SELECT 1 FROM chunks c WHERE c.hash = ec.hash)")
      pruned=cur.fetchone()[0]
      cur.execute("DELETE FROM embedding_cache WHERE rowid IN (SELECT ec.rowid FROM embedding_cache ec WHERE NOT EXISTS (SELECT 1 FROM chunks c WHERE c.hash = ec.hash))")

    # prune orphan vec row ids if table exists
    if 'chunks_vec_rowids' in tables and 'chunks' in tables:
      cur.execute("DELETE FROM chunks_vec_rowids WHERE NOT EXISTS (SELECT 1 FROM chunks c WHERE c.id = chunks_vec_rowids.id)")

    conn.commit()
    conn.close()

    # Vacuum DB file (SQLite only supports DB-wide vacuum)
    conn=sqlite3.connect(db)
    conn.execute('VACUUM')
    conn.close()

    size_after=os.path.getsize(db)
    entry['size_after']=size_after
    entry['reclaimed_bytes']=max(0,size_before-size_after)
    entry['archived']=len(archived_rows)
    entry['orphan_embeddings_pruned']=pruned

    summary['totals']['archived']+=entry['archived']
    summary['totals']['orphan_embeddings_pruned']+=entry['orphan_embeddings_pruned']
    summary['totals']['storage_reclaimed_bytes']+=entry['reclaimed_bytes']

  except Exception as e:
    entry['error']=str(e)
    summary['errors'].append({'db':name,'error':str(e),'trace':traceback.format_exc()})
  summary['databases'].append(entry)

print(json.dumps(summary,indent=2))
