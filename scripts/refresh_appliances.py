#!/usr/bin/env python3
"""Capture ENERGY STAR refrigerator records explicitly listed for Canada."""
import csv,hashlib,io,json,math,time
from datetime import datetime,timezone
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[1]
def read(url):
 if urlsplit(url).scheme!='https' or urlsplit(url).hostname!='data.energystar.gov':raise ValueError('Unexpected appliance source')
 with urlopen(Request(url,headers={'User-Agent':'CoolCode TariffBench/1.0 (+https://coolcode.ca/tariffbench/)'}),timeout=90) as response:
  b=response.read(10000001)
  if len(b)>10000000:raise ValueError('Appliance source exceeds expected size')
  return b
def parse(data,market):
 reader=csv.DictReader(io.StringIO(data.decode('utf-8-sig')))
 required={'ENERGY STAR Unique ID','Brand Name','Model Number','Markets','Annual Energy Use (kWh/yr)'}
 if not required<=set(reader.fieldnames or []):raise ValueError('Appliance CSV schema changed')
 result=[]
 for r in reader:
  if market not in [x.strip() for x in r['Markets'].split(',')]:continue
  try:kwh=float(r['Annual Energy Use (kWh/yr)'])
  except ValueError:raise ValueError('Missing annual energy rating')
  if not math.isfinite(kwh) or not 0<kwh<10000:raise ValueError('Invalid annual energy rating')
  if not r['Brand Name'] or not r['Model Number'] or not r['ENERGY STAR Unique ID'].isdigit():raise ValueError('Incomplete model identity')
  result.append({'id':r['ENERGY STAR Unique ID'],'brand':r['Brand Name'],'model':r['Model Number'],'type':r.get('Type',''),'annualKwh':kwh,'capacityFt3':r.get('Capacity (Total Volume) (ft3)',''),'certified':r.get('Date Certified',''),'markets':r['Markets']})
 return sorted(result,key=lambda r:(r['brand'].lower(),r['model']))
def main():
 c=json.loads((ROOT/'config/appliances.json').read_text());body=read(c['exportUrl']);rows=parse(body,c['market']);metadata=json.loads(read(c['metadataUrl']))
 if len(rows)<c['minimumRows']:raise ValueError('Appliance capture unexpectedly small')
 updated=metadata.get('rowsUpdatedAt');stamp=datetime.fromtimestamp(updated,timezone.utc).isoformat() if isinstance(updated,(float,int)) else None
 status={'capturedAt':datetime.now(timezone.utc).isoformat(),'sourceUpdatedAt':stamp,'source':c['sourceUrl'],'download':c['exportUrl'],'sha256':hashlib.sha256(body).hexdigest(),'count':len(rows),'market':c['market'],'coverage':'ENERGY STAR residential refrigeration catalogue records listing Canada; not all appliances sold in Canada.'}
 p=ROOT/'web/data';p.mkdir(exist_ok=True)
 for name,value in [('appliances.json',{**status,'records':rows}),('appliances-status.json',status)]:
  tmp=p/(name+'.tmp');tmp.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n');tmp.replace(p/name)
 print(f'Captured {len(rows)} Canadian-market appliance records')
if __name__=='__main__':main()
