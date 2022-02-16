#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { AwsSamStack } from "../lib/aws-sam-stack";

const app = new cdk.App();
new AwsSamStack(app, "AwsSamStack");
