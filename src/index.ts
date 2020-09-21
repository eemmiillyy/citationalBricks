import csv from "csvtojson";
import { v1 as uuidv1 } from "uuid";
import fs from "fs";
import path from "path";
const axios = require("axios").default;
require("dotenv").config();

async function main() {
  const dir = "./books";
  fs.readdirSync(dir).forEach(async (file: any) => {
    let names: Array<string> = [];
    await csv({
      downstreamFormat: "array",
      ignoreEmpty: true,
      flatKeys: true,
      colParser: {
        Author: async function(item) {
          let independentAuthors = item
            .toLowerCase()
            .replace("&", ",")
            .replace('"', "")
            .replace("'", "")
            .replace("and", ",")
            .replace("et al", "")
            .replace("/", "")
            .replace("(", "")
            .replace("transl.", "")
            .replace(")", "")
            .replace(".", "")
            .split(",");
          independentAuthors.forEach((author) => {
            if (!names.find((name) => name === author)) {
              names.push(author.trim());
            }
          });
          names = names.filter((name) => name != "");
        },
      },
    }).fromFile(path.join(dir, file), {});

    // Sanitize
    const firstAndLastNames: Array<{
      ["id"]: string;
      ["firstName"]: string;
      ["lastName"]: string;
    }> = [];
    names.forEach((name) => {
      const str = name.split(" ");
      const strLength = str.length - 1;
      firstAndLastNames.push({
        id: uuidv1(),
        firstName: str[0],
        lastName: str[strLength],
      });
    });
    // Generate random sample as NamSor only accepts batches containing up to 100 data points
    let sample = firstAndLastNames;
    if (sample.length > 100) {
      const shuffled = firstAndLastNames.sort(() => 0.5 - Math.random());
      sample = shuffled.slice(0, 100);
    }

    const data = JSON.stringify({ personalNames: sample });
    // Request Gender Predictions
    const res = await axios.post(process.env.GENDER_ENDPOINT, data, {
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": process.env.API_KEY,
      },
    });
    // Request Ethnicity Predictions
    const res2 = await axios.post(process.env.ETHNICITY_ENDPOINT, data, {
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": process.env.API_KEY,
      },
    });

    // Create Generated Artifacts
    if (!fs.existsSync("./generated")) {
      fs.mkdir("./generated", (err) => {
        if (err) {
          console.log(err);
        }
      });
    }

    // Compare Rates
    let womanAuthorCount: number = 0;
    let maleAuthorCount: number = 0;
    let nonEuropeanAuthorCount: number = 0;
    let europeanAuthorCount: number = 0;
    res.data.personalNames.forEach((name: any) => {
      if (name.likelyGender !== "male") {
        womanAuthorCount++;
      } else {
        maleAuthorCount++;
      }
    });
    res2.data.personalNames.forEach((name: any) => {
      if (name.topRegionOrigin !== "Europe") {
        nonEuropeanAuthorCount++;
      } else {
        europeanAuthorCount++;
      }
    });
    if (
      res.data &&
      res2.data &&
      res.data.personalNames &&
      res2.data.personalNames
    ) {
      fs.writeFile(
        "./generated/" + file,
        JSON.stringify({
          dataGender: res.data.personalNames,
          dataEthnicity: res2.data.personalNames,
          womanAuthorCount,
          maleAuthorCount,
          maleRatio: maleAuthorCount / (maleAuthorCount + womanAuthorCount),
          nonEuropeanAuthorCount,
          europeanAuthorCount,
          europeanAuthorRatio:
            europeanAuthorCount /
            (europeanAuthorCount + nonEuropeanAuthorCount),
        }),
        (err: any) => {
          if (err) {
            throw err;
          }
          console.log(
            "\n\n📝 Citation Data Estimations for " + file + " 📝\n\n",
            "👨 👩 Male to Female ---> " +
              (maleAuthorCount / (maleAuthorCount + womanAuthorCount)) * 100 +
              "%"
          );
          console.log(
            "🌸 🌼 European to Non-European ---> " +
              (europeanAuthorCount /
                (europeanAuthorCount + nonEuropeanAuthorCount)) *
                100 +
              "%" +
              "\n\n"
          );
        }
      );
    }
  });
}

main();
