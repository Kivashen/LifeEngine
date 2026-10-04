const CellStates = require("../CellStates");
const BodyCell = require("./BodyCell");

class PoisonCell extends BodyCell{
    constructor(org, loc_col, loc_row){
        super(CellStates.poison, org, loc_col, loc_row);
    }
}

module.exports = PoisonCell;