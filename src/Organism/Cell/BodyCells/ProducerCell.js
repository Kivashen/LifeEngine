const CellStates = require("../CellStates");
const BodyCell = require("./BodyCell");
const Hyperparams = require("../../../Hyperparameters");

class ProducerCell extends BodyCell{
    constructor(org, loc_col, loc_row){
        super(CellStates.producer, org, loc_col, loc_row);
        this.org.anatomy.is_producer = true;
    }

    // true if this organism has a toxin cell somewhere in its body
    carriesToxin() {
        for (var cell of this.org.anatomy.cells) {
            if (cell.state == CellStates.toxin)
                return true;
        }
        return false;
    }

    performFunction() {
        if (this.impaired)
            return; // a toxin has stopped this producer making food
        if (this.carriesToxin())
            return; // a plant hit by the toxin carries a toxin cell: its producers can no longer make food
        if (this.org.anatomy.is_mover && !Hyperparams.moversCanProduce)
            return;
        var env = this.org.env;
        var prob = Hyperparams.foodProdProb;
        var real_c = this.getRealCol();
        var real_r = this.getRealRow();
        if (Math.random() * 100 <= prob) {
            var loc = Hyperparams.growableNeighbors[Math.floor(Math.random() * Hyperparams.growableNeighbors.length)]
            var loc_c=loc[0];
            var loc_r=loc[1];
            var cell = env.grid_map.cellAt(real_c+loc_c, real_r+loc_r);
            if (cell != null && cell.state == CellStates.empty){
                env.changeCell(real_c+loc_c, real_r+loc_r, CellStates.food, null);
                return;
            }
        }
    }
}

module.exports = ProducerCell;