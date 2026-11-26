import test from'node:test';import assert from'node:assert/strict';import{applianceWatts,applianceMatches}from'../web/appliances.mjs';import{deviceKwh}from'../web/model.mjs';
test('annual rating conversion retains actual annual kWh',()=>{assert.ok(Math.abs(deviceKwh({name:'Fridge',watts:applianceWatts(432),hours:24,quantity:1},365)-432)<1e-8)});
test('arbitrary models can be found beyond starter presets',()=>{assert.equal(applianceMatches([{brand:'New Brand',model:'XYZ123',type:'Fridge'}],'xyz123').length,1);assert.throws(()=>applianceWatts('missing'))});
