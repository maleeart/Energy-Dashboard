"""
Test suite for 3D Building & Road Layout Editor with Interactive Excel Grid.
Verifies integration between:
- Interactive Excel 2D Grid & Coordinates Table in twin.html
- Road network management in scripts/energy-twin-core.js
- 3D road mesh update in scripts/energy-twin-3d.js
- Excel template and CSV exports
"""
import unittest
import os
import re

class TestInteractiveExcelGridAndRoads(unittest.TestCase):
    def setUp(self):
        self.base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.twin_html_path = os.path.join(self.base_dir, 'twin.html')
        self.core_js_path = os.path.join(self.base_dir, 'scripts', 'energy-twin-core.js')
        self.scene_3d_path = os.path.join(self.base_dir, 'scripts', 'energy-twin-3d.js')

        with open(self.twin_html_path, 'r', encoding='utf-8') as f:
            self.twin_html = f.read()

        with open(self.core_js_path, 'r', encoding='utf-8') as f:
            self.core_js = f.read()

        with open(self.scene_3d_path, 'r', encoding='utf-8') as f:
            self.scene_3d = f.read()

    def test_twin_html_has_interactive_grid_markup(self):
        self.assertIn('id="layoutTabGrid"', self.twin_html)
        self.assertIn('id="layoutTabTable"', self.twin_html)
        self.assertIn('id="excelGridTable"', self.twin_html)
        self.assertIn('id="excelGridViewport"', self.twin_html)
        self.assertIn('switchLayoutEditorTab', self.twin_html)
        self.assertIn('gridCategoryFilter', self.twin_html)

    def test_twin_html_has_grid_controller_functions(self):
        self.assertIn('function renderInteractiveExcelGrid()', self.twin_html)
        self.assertIn('function onGridDragStart(', self.twin_html)
        self.assertIn('function onGridDrop(', self.twin_html)
        self.assertIn('function onGridBadgeClick(', self.twin_html)
        self.assertIn('function onGridCellClick(', self.twin_html)
        self.assertIn('function moveLayoutItem(', self.twin_html)
        self.assertIn('function selectGridItem(', self.twin_html)
        self.assertIn('function scrollGridToCoord(', self.twin_html)

    def test_twin_html_has_road_network_controls(self):
        self.assertIn('onRoadCoordInput', self.twin_html)
        self.assertIn('onRoadCoordStep', self.twin_html)
        self.assertIn('focusRoadInLayout', self.twin_html)
        self.assertIn('resetSingleRoadPosition', self.twin_html)
        self.assertIn('layoutRoadInput_x_', self.twin_html)
        self.assertIn('layoutRoadInput_z_', self.twin_html)

    def test_core_js_has_road_management(self):
        self.assertIn('defaultRoads:', self.core_js)
        self.assertIn('ROAD_MAIN_BOULEVARD', self.core_js)
        self.assertIn('ROAD_SPINE_WORKSHOP', self.core_js)
        self.assertIn('ROAD_WEST_CANAL', self.core_js)
        self.assertIn('ROAD_OHK_ACCESS', self.core_js)
        self.assertIn('getRoadsList()', self.core_js)
        self.assertIn('saveCustomRoads(roadMap)', self.core_js)
        self.assertIn('loadCustomRoads()', self.core_js)
        self.assertIn('resetCustomRoads()', self.core_js)

    def test_scene_3d_has_road_updates(self):
        self.assertIn('this.roadMeshes', self.scene_3d)
        self.assertIn('updateRoadPosition(roadId, newX, newZ)', self.scene_3d)
        self.assertIn('focusPoint(x, z', self.scene_3d)

    def test_template_files_exist(self):
        xlsx_path = os.path.join(self.base_dir, 'data', 'sainoi_campus_layout_template.xlsx')
        csv_path = os.path.join(self.base_dir, 'data', 'sainoi_campus_layout.csv')
        grid_csv_path = os.path.join(self.base_dir, 'data', 'sainoi_campus_grid_map.csv')

        self.assertTrue(os.path.exists(xlsx_path), "Excel template .xlsx must exist")
        self.assertTrue(os.path.exists(csv_path), "Layout CSV must exist")
        self.assertTrue(os.path.exists(grid_csv_path), "2D Grid map CSV must exist")

        with open(csv_path, 'r', encoding='utf-8-sig') as f:
            content = f.read()
            self.assertIn('ROAD_MAIN_BOULEVARD', content)
            self.assertIn('T.0019', content)

if __name__ == '__main__':
    unittest.main()
