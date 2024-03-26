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

  let state: NodeState = { //par défault on met ca
    killed: false,
    x: initialValue,
    decided: false,
    k: null
  };


  let tab_x1: Map<number, Value[]> = new Map();
  let tab_x2: Map<number, Value[]> = new Map();


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

    if(!isFaulty && !state.killed && !state.decided){

      if(phase === 1){

        let tab_x1_K = tab_x1.get(k) ?? [];
        tab_x1_K.push(x);
        tab_x1.set(k, tab_x1_K);

        // if the node has received N - F proposals, it should send a vote message to all other nodes
        if(tab_x1_K.length >= N - F){
          let occurences: Map<Value, number> = new Map();

          for(let i = 0; i < tab_x1_K.length; i++){
            let value = tab_x1_K[i];
            if(occurences.has(value)){
              occurences.set(value, (occurences.get(value) ?? 0) + 1);
            } else {
              occurences.set(value, 1);
            }
          }

          let dominantX : Value = "?";
          for (const [value, count] of occurences) {
            if (count > (N / 2)) {
              dominantX = value;
            }
          }

          for(let i = 0; i < N; i++){
            fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                phase: 2,
                k: k,
                x: dominantX,
              })
            });
          }
        }
      }
      else {
        let tab_x2_K = tab_x2.get(k) ?? [];
        tab_x2_K.push(x);
        tab_x2.set(k, tab_x2_K);
        // if the node has received N - F votes, it should decide on the value
        if (tab_x2_K.length >= N - F) {
          let occurences: Value[] = [];
          for (let i = 0; i < tab_x2_K.length; i++) {
            occurences.push(tab_x2_K[i]);
          }

          let occurences1 = occurences.filter((value) => value === 1);
          let occurences0 = occurences.filter((value) => value === 0);
          // Case where there is at least F + 1 votes for the same value that is not "?"
          if (occurences1.length >= F + 1) {
            state.x = 1;
            state.k = k;
            state.decided = true;
          } else if (occurences0.length >= F + 1) {
            state.x = 0;
            state.k = k;
            state.decided = true;
          }
          // Case where at least one value other than "?" appears one or more times
          else if (occurences.filter((value) => value !== "?").length > 0) {
            state.x = occurences1.length > occurences0.length ? 1 : 0;
            state.k = k + 1;
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
          // Case where all values are "?", then the node increments k and chooses a random value
          else {
            state.k = k + 1;
            state.x = Math.random() < 0.5 ? 0 as Value : 1 as Value;
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