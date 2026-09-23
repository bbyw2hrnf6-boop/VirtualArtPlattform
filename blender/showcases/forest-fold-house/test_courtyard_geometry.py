"""Run with python3; mutation checks for physical paving regressions."""
from copy import deepcopy
import unittest

from courtyard_geometry_checks import paving_issues


class CourtyardGeometryTests(unittest.TestCase):
    def setUp(self):
        self.perimeter=(0,0,2,1)
        self.bed={'name':'bed','bounds':(0,0,-.225,2,1,-.045),'walk_surface':False}
        self.tiles=[{'name':f'{x}/{y}','bounds':(x+.001,y+.001,-.06,x+.999,y+.499,0),'walk_surface':True}
                    for x in (0,1) for y in (0,.5)]

    def check(self):
        return paving_issues(self.tiles,self.perimeter,self.bed)

    def test_exact_perimeter_and_two_mm_joints_are_supported(self):
        self.assertEqual(self.check(),[])

    def test_missing_interior_stone_cannot_hide_behind_outer_bounds(self):
        self.tiles.pop(1)
        self.assertIn('Paving coverage contains a hole wider than the permitted joint',self.check())

    def test_overhang_gap_and_duplicate_top_are_rejected(self):
        for change in ['overhang','gap','duplicate']:
            with self.subTest(change=change):
                self.setUp()
                if change=='duplicate':self.tiles.append(deepcopy(self.tiles[0]))
                else:
                    bounds=list(self.tiles[0]['bounds']);bounds[0]+=-.02 if change=='overhang' else .02
                    self.tiles[0]['bounds']=bounds
                self.assertTrue(self.check())

    def test_walk_tags_are_required_only_on_the_top_stones(self):
        self.tiles[0]['walk_surface']=False
        self.assertTrue(any('missing walk surface tag' in issue for issue in self.check()))
        self.tiles[0]['walk_surface']=True;self.bed['walk_surface']=True
        self.assertIn('Buried paving foundation is tagged as a walk surface',self.check())

    def test_no_floating_paving_or_raised_walking_plane(self):
        self.bed['bounds']=(0,0,-.3,2,1,-.08)
        self.assertTrue(any('continuous support' in issue for issue in self.check()))
        self.setUp();bounds=list(self.tiles[0]['bounds']);bounds[5]=.02;self.tiles[0]['bounds']=bounds
        self.assertTrue(any('zero-level walking plane' in issue for issue in self.check()))


if __name__=='__main__':unittest.main()
