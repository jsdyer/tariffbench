import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from refresh_appliances import parse
class ApplianceTests(unittest.TestCase):
 def test_filters_explicit_market_and_preserves_model(self):
  b=b'ENERGY STAR Unique ID,Brand Name,Model Number,Markets,Annual Energy Use (kWh/yr)\n1,Brand,AB-12,"United States, Canada",432\n2,Other,CD,United States,500\n'
  rows=parse(b,'Canada');self.assertEqual(len(rows),1);self.assertEqual(rows[0]['annualKwh'],432)
 def test_missing_rating_and_schema_rejected(self):
  with self.assertRaises(ValueError):parse(b'<html>down</html>','Canada')
  with self.assertRaises(ValueError):parse(b'ENERGY STAR Unique ID,Brand Name,Model Number,Markets,Annual Energy Use (kWh/yr)\n1,Brand,AB,Canada,\n','Canada')
