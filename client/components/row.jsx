import Seat from "./seat";

const Row=({rowNo,cols,busNo})=>{
    return (
        <div className="flex gap-2 m-2">
            {
                [...Array(cols)].map((_,ind)=>(
                    <Seat seatNo={(rowNo*5)+(ind+1)} busNo={busNo} key={ind}></Seat>
                ))  
            }
        </div>
    );
};

export default Row;