const CellStates = require("../CellStates");
const BodyCell = require("./BodyCell");

class MoverCell extends BodyCell{
    constructor(org, loc_col, loc_row){
        super(CellStates.mover, org, loc_col, loc_row);
        this.org.anatomy.is_mover = true;
    }

    performFunction() {
        // An organism can only move while at least one of its mover cells still works.
        if (!this.impaired)
            return;
        for (var cell of this.org.anatomy.cells) {
            if (cell.state == CellStates.mover && !cell.impaired) {
                this.org.anatomy.is_mover = true;
                return;
            }
        }
        this.org.anatomy.is_mover = false;
    }
}

module.exports = MoverCell;