import subprocess
import unittest
import os

class TestPerformanceCaching(unittest.TestCase):
    def test_node_caching_and_memoization(self):
        script = """
        require('./scripts/energy-twin-core.js');
        const ET = global.EnergyTwin;
        ET.mappingData = require('./data/building_mapping.json');
        ET.summaryData = require('./data/building_energy_summary.json');
        ET.aliasData = require('./data/building_alias.json');

        // 1. Alias Caching
        const a1 = ET.getBuildingAliases('T.0019');
        const a2 = ET.getBuildingAliases('T.0019');
        if (a1 !== a2) throw new Error('Alias cache failed');

        // 2. Buildings List Memoization
        const b1 = ET.getBuildingsList();
        const b2 = ET.getBuildingsList();
        if (b1 !== b2) throw new Error('Buildings list memoization failed');
        if (b1.length !== 29) throw new Error('Expected 29 buildings, got ' + b1.length);

        // 3. Campus Total Memoization
        const t1 = ET.getCampusTotal();
        const t2 = ET.getCampusTotal();
        if (t1 !== t2) throw new Error('Campus total memoization failed');

        // 4. Invalidation on filter change
        ET.setState({ monthFrom: 1, monthTo: 6 });
        const b3 = ET.getBuildingsList();
        if (b3 === b1) throw new Error('Cache invalidation failed on month change');

        // 5. Invalidation on department filter change
        ET.setState({ department: 'อบค.' });
        const bDept = ET.getBuildingsList();
        if (bDept.length >= 29) throw new Error('Department filtering failed');

        console.log('PASS');
        """
        res = subprocess.run(['node', '-e', script], capture_output=True, text=True, cwd=os.getcwd())
        self.assertEqual(res.returncode, 0, msg=f"Node error: {res.stderr}")
        self.assertIn("PASS", res.stdout)

if __name__ == '__main__':
    unittest.main()
