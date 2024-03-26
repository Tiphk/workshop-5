import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { Value, NodeState } from "../types";
import { delay } from "../utils";
import axios from 'axios';

export async function node(
    nodeId: number, // the ID of the node
    N: number, // total number of nodes in the network
    F: number, // number of faulty nodes in the network
    initialValue: Value, // initial value of the node
    isFaulty: boolean, // true if the node is faulty, false otherwise
    nodesAreReady: () => boolean, // used to know if all nodes are ready to receive requests
    setNodeIsReady: (index: number) => void // this should be called when the node is started and ready to receive requests
) {

  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

  let state: NodeState = { //par défault
    killed: false,
    x: initialValue,
    decided: false,
    k: null
  };


  let tab_x1: Map<number, Value[]> = new Map(); //pour phase 1
  let tab_x2: Map<number, Value[]> = new Map(); //pour phase 2


  // TODO implement this
  // this route allows retrieving the current status of the node
  node.get("/status", (req, res) => {
    if (isFaulty) {
      res.status(500).send("faulty");
    } else {
      res.status(200).send("live");
    }
  });

  // TODO implement this
  // get the current state of a node
  node.get("/getState", (req, res) => {
    if (state) {
      //state = {killed: false , x: initialValue, decided: false, k: 1};
      res.send(state);
    }
  });

  // TODO implement this
  // this route allows the node to receive messages from other nodes
  node.post("/message",  (req, res) => {
    let {phase, k, x} = req.body;

    if(!isFaulty && !state.killed && !state.decided) //on process le message uniquement si...
    {

      if(phase === 1){ // phase ou on va "proposer" des valeurs

        let tab_x1_K = tab_x1.get(k) ?? [];
        tab_x1_K.push(x);
        tab_x1.set(k, tab_x1_K);

        //condition de l'algo
        if(tab_x1_K.length >= N - F){

          let compteur_x0 = tab_x1_K.filter((value) => value == 0).length;
          let compteur_x1 = tab_x1_K.filter((value) => value == 1).length;
          if (compteur_x0 > N/2) {
            x = 0;
          } else if (compteur_x1 > N/2) {
            x = 1;
          } else {
            x = "?";
          }

          //on envoie en phase 2
          for(let i = 0; i < N; i++){
            fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                phase: 2,
                k: k,
                x: x,
              })
            });
          }
        }
      }
      else { //phase 2

        let tab_x2_K = tab_x2.get(k) ?? [];
        tab_x2_K.push(x);
        tab_x2.set(k, tab_x2_K);

        //condition algo
        if (tab_x2_K.length >= N - F) {
          let compteur2: Value[] = [];
          for (let i = 0; i < tab_x2_K.length; i++) {
            compteur2.push(tab_x2_K[i]);
          }

          let compteur_x0 = compteur2.filter((value) => value === 0);
          let compteur_x1 = compteur2.filter((value) => value === 1);

          if (compteur_x1.length >= F + 1) {
            state.x = 1;
            state.k = k;
            state.decided = true;
          } else if (compteur_x0.length >= F + 1) {
            state.x = 0;
            state.k = k;
            state.decided = true;
          }
          else {

            state.k = k + 1;

            // on a de tout
            if (compteur2.filter((value) => value !== "?").length > 0) {
              state.x = compteur_x1.length > compteur_x0.length ? 1 : 0;
            }

            else { //cas ou que des ? du coup on y va à l'aléatoire
              state.x = Math.random() < 0.5 ? 0 as Value : 1 as Value;
            }

            //on retourne en phase 1
            for (let i = 0; i < N; i++) {
              fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  phase: 1,
                  k: state.k,
                  x: state.x,
                })
              });
            }
          }
        }
      }
    }
    res.status(200).send("message received");

  });

  // TODO implement this
  // this route is used to start the consensus algorithm
  node.get("/start", async (req, res) => {

    if(!isFaulty){

      while(!nodesAreReady()) {
        await delay(50);
      }

      state.k = 1;

      for (let i = 0; i < N; i++) {
        await fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phase: 1,
            k: state.k,
            x: state.x
          })
        });
      }

    }
    else { // is faulty true

      state.k = null;
      state.x = null;
      state.decided = null;

      //res.status(500).send("Erreur Node Faulty");
    }
    res.status(200).send("Start");

  });

  // TODO implement this
  // this route is used to stop the consensus algorithm
  node.get('/stop', (req, res) => {
    state.killed = true;
    res.send("Node stopped");
  });


  // start the server
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(
        `Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`
    );
    // the node is ready
    setNodeIsReady(nodeId);
  });

  return server;
}